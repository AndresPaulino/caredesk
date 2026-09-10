import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ASSESSMENT_KIND_BY_KEY, type AssessmentKind } from "@/lib/clinical/assessment-kinds";
import {
  summarizeAssessments,
  type AssessmentSummaryStatus,
} from "@/lib/clinical/assessment-summary";
import {
  ADMINISTRATION_STATUS_LABELS,
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
  MEDICATION_ORDER_STATUS_LABELS,
} from "@/lib/clinical/labels";
import { MEDICATION_FREQUENCY_LABELS } from "@/lib/clinical/medication-schedule";
import { VITAL_LABELS, outOfRangeReadings } from "@/lib/clinical/vital-ranges";
import { ageOn, formatStaffName, type StaffName } from "@/lib/format";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  STAY_END_REASON_LABELS,
  sexLabel,
} from "@/lib/residents/labels";
import { getResident, type ResidentDirectoryEntry } from "@/lib/residents/queries";
import type { RecordTabKey } from "@/lib/residents/record-tabs";
import type { Database, Enums, Tables } from "@/lib/supabase/database.types";
import { escapeLike } from "@/lib/supabase/like";
import { dateInZone, daysBetween } from "@/lib/time";

import { residentSearchTerms } from "./search";

/**
 * The assistant's core tools: the only way it touches data (ADR 0001). Each is a plain
 * function over the caller's own Supabase client, so Row Level Security decides what comes
 * back exactly as it does for the pages (ADR 0003): a resident outside the caller's scope is
 * not found, the same as one who does not exist, and no tool can widen that. The model-facing
 * wrappers live in `tool-definitions.ts`; these functions are the seam the integration tests
 * exercise without the model.
 *
 * Results are shaped for two readers. The model gets labels and calendar dates it can quote
 * ("Once daily", "2026-05-02", 131 days ago). Source chips get identifiers: every result about
 * a resident carries a `source` naming the resident and the record tab, and every record its
 * id, so an answer can link to what it relied on.
 */

export type AssistantClient = SupabaseClient<Database>;

export type ToolContext = {
  supabase: AssistantClient;
  /** The instant the question was asked; "today" and "days ago" are measured from it. */
  now: Date;
};

/** Where a result came from: enough for a source chip to link to the resident page and tab. */
export type SourceRef = {
  residentId: string;
  residentName: string;
  /** The record tab holding these records, or null for the resident page itself. */
  tab: RecordTabKey | null;
};

export const FIND_RESIDENTS_LIMIT = 10;
export const ASSESSMENTS_LIMIT = 20;
export const ADMINISTRATIONS_PER_ORDER = 5;
export const VITALS_LIMIT = 10;
export const VITALS_MAX_LIMIT = 50;

/** Administrations read for one resident before grouping by order. A chart holds far fewer. */
const ADMINISTRATIONS_CAP = 200;

const STAFF_COLUMNS = "id, first_name, last_name, credentials, role";

/** `*` plus the staff member behind one foreign key, as `staff`. */
const withStaff = <Key extends string>(foreignKey: Key) =>
  `*, staff:staff!${foreignKey} (${STAFF_COLUMNS})` as const;

// ---------------------------------------------------------------------------------------------
// find_residents
// ---------------------------------------------------------------------------------------------

export type FindResidentsInput = {
  /** A name, part of a name, or a room number. */
  query: string;
  /** A unit code ("B") or part of a unit name. */
  unit?: string;
  /** A facility code ("MDW") or part of a facility name. */
  facility?: string;
  status?: "current" | "former" | "all";
};

export type ResidentMatch = {
  id: string;
  name: string;
  status: Enums<"resident_status">;
  facility: string;
  unit: string;
  room: string | null;
  dateOfBirth: string;
  age: number;
  /** For a former resident, when and why the stay ended. */
  stayEnded: { on: string; reason: string } | null;
};

export type FindResidentsResult = {
  query: string;
  /** At most `FIND_RESIDENTS_LIMIT` of `total`, by last name then first name. */
  matches: ResidentMatch[];
  total: number;
};

/**
 * Residents whose name or room number matches every term of the query, within the caller's
 * scope. "Mr. Doe" finds every Doe the caller may see; "Harold Doe" narrows to one.
 */
export async function findResidents(
  { supabase, now }: ToolContext,
  input: FindResidentsInput,
): Promise<FindResidentsResult> {
  const terms = residentSearchTerms(input.query);
  if (terms.length === 0) return { query: input.query, matches: [], total: 0 };

  let query = supabase
    .from("resident_directory")
    .select("*", { count: "exact" })
    .is("archived_at", null);
  for (const term of terms) query = query.ilike("search_text", `%${escapeLike(term)}%`);

  const unit = input.unit?.trim();
  if (unit) {
    query = /^[a-z]$/i.test(unit)
      ? query.eq("unit_code", unit.toUpperCase())
      : query.ilike("unit_name", `%${escapeLike(unit)}%`);
  }
  const facility = input.facility?.trim();
  if (facility) {
    query = /^[A-Z]{2,4}$/.test(facility)
      ? query.eq("facility_code", facility)
      : query.ilike("facility_name", `%${escapeLike(facility)}%`);
  }
  const status = input.status ?? "all";
  if (status !== "all") query = query.eq("status", status);

  const { data, count, error } = await query
    .order("last_name")
    .order("first_name")
    .limit(FIND_RESIDENTS_LIMIT);
  if (error) throw new Error(`Could not search residents: ${error.message}`);

  return {
    query: input.query,
    matches: (data ?? []).map((row) => toMatch(row, now)),
    total: count ?? 0,
  };
}

function toMatch(row: ResidentDirectoryEntry, now: Date): ResidentMatch {
  return {
    id: row.id,
    name: row.full_name,
    status: row.status,
    facility: row.facility_name,
    unit: row.unit_name,
    room: row.room_number,
    dateOfBirth: row.date_of_birth,
    age: ageOn(row.date_of_birth, now),
    stayEnded:
      row.stay_ended_on && row.stay_end_reason
        ? { on: row.stay_ended_on, reason: STAY_END_REASON_LABELS[row.stay_end_reason] }
        : null,
  };
}

// ---------------------------------------------------------------------------------------------
// get_resident_summary
// ---------------------------------------------------------------------------------------------

export type ResidentSummary = {
  source: SourceRef;
  resident: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    sex: string;
    dateOfBirth: string;
    age: number;
    status: Enums<"resident_status">;
    admissionDate: string;
    stayEnded: { on: string; reason: string } | null;
    facility: string;
    unit: string;
    room: string | null;
    codeStatus: string;
    diet: string;
    mobility: string;
  };
  /** Active conditions first, then resolved ones, each newest onset first. */
  conditions: Array<{
    id: string;
    description: string;
    onsetDate: string;
    resolvedOn: string | null;
  }>;
};

/** The essentials of one resident with their conditions, or null when none is visible. */
export async function getResidentSummary(
  { supabase, now }: ToolContext,
  { residentId }: { residentId: string },
): Promise<ResidentSummary | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const conditions = await loadConditions(supabase, residentId);
  const match = toMatch(resident, now);

  return {
    source: sourceFor(resident, null),
    resident: {
      id: resident.id,
      name: resident.full_name,
      firstName: resident.first_name,
      lastName: resident.last_name,
      sex: sexLabel(resident.sex),
      dateOfBirth: resident.date_of_birth,
      age: match.age,
      status: resident.status,
      admissionDate: resident.admission_date,
      stayEnded: match.stayEnded,
      facility: resident.facility_name,
      unit: resident.unit_name,
      room: resident.room_number,
      codeStatus: CODE_STATUS_LABELS[resident.code_status],
      diet: DIET_LABELS[resident.diet],
      mobility: MOBILITY_LABELS[resident.mobility],
    },
    conditions: conditions.map((condition) => ({
      id: condition.id,
      description: condition.description,
      onsetDate: condition.onset_date,
      resolvedOn: condition.resolved_on,
    })),
  };
}

async function loadConditions(
  supabase: AssistantClient,
  residentId: string,
): Promise<Tables<"conditions">[]> {
  const { data, error } = await supabase
    .from("conditions")
    .select("*")
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .order("resolved_on", { ascending: true, nullsFirst: true })
    .order("onset_date", { ascending: false });
  if (error) throw new Error(`Could not load conditions: ${error.message}`);
  return data ?? [];
}

// ---------------------------------------------------------------------------------------------
// get_assessments
// ---------------------------------------------------------------------------------------------

export type AssessmentsInput = {
  residentId: string;
  /** One kind only; omitted for every kind. */
  kind?: AssessmentKind;
  limit?: number;
};

export type AssessmentsResult = {
  source: SourceRef;
  residentStatus: Enums<"resident_status">;
  /** One entry per kind (or the one kind asked for): last done, next due, and whether overdue. */
  summary: Array<{
    kind: AssessmentKind;
    name: string;
    dueEveryDays: number;
    lastDone: { id: string; performedOn: string; daysAgo: number } | null;
    nextDue: string | null;
    daysUntilDue: number | null;
    status: AssessmentSummaryStatus;
  }>;
  /** The assessments themselves, newest first, at most `limit` of `total`. */
  assessments: Array<{
    id: string;
    kind: AssessmentKind;
    kindName: string;
    performedAt: string;
    performedOn: string;
    daysAgo: number;
    performedBy: string | null;
    findings: string;
    /** Morse Fall Scale total on a fall-risk assessment; null otherwise. */
    score: number | null;
  }>;
  total: number;
};

/**
 * A resident's assessments and the summary behind "when was the last exam": the latest of
 * each kind, when the next is due, and whether it is overdue. Null when no resident is visible.
 */
export async function getAssessments(
  { supabase, now }: ToolContext,
  { residentId, kind, limit = ASSESSMENTS_LIMIT }: AssessmentsInput,
): Promise<AssessmentsResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const { data, error } = await supabase
    .from("assessments")
    .select(withStaff("assessments_performed_by_fkey"))
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .order("performed_at", { ascending: false });
  if (error) throw new Error(`Could not load assessments: ${error.message}`);

  const rows = data ?? [];
  const today = dateInZone(now);
  const summary = summarizeAssessments(rows, { today, residentStatus: resident.status }).filter(
    (entry) => !kind || entry.kind === kind,
  );
  const matching = kind ? rows.filter((row) => row.kind === kind) : rows;

  return {
    source: sourceFor(resident, null),
    residentStatus: resident.status,
    summary: summary.map((entry) => ({
      kind: entry.kind,
      name: entry.name,
      dueEveryDays: entry.dueEveryDays,
      lastDone: entry.lastDone
        ? {
            id: entry.lastDone.id,
            performedOn: entry.lastDone.performedOn,
            daysAgo: daysBetween(entry.lastDone.performedOn, today),
          }
        : null,
      nextDue: entry.nextDue,
      daysUntilDue: entry.daysUntilDue,
      status: entry.status,
    })),
    assessments: matching.slice(0, Math.max(1, limit)).map((row) => {
      const performedOn = dateInZone(new Date(row.performed_at));
      return {
        id: row.id,
        kind: row.kind,
        kindName: ASSESSMENT_KIND_BY_KEY.get(row.kind)?.name ?? row.kind,
        performedAt: row.performed_at,
        performedOn,
        daysAgo: daysBetween(performedOn, today),
        performedBy: formatStaffName(row.staff),
        findings: row.findings,
        score: row.score,
      };
    }),
    total: matching.length,
  };
}

// ---------------------------------------------------------------------------------------------
// get_medication_orders
// ---------------------------------------------------------------------------------------------

export type MedicationOrdersInput = {
  residentId: string;
  /** Active orders by default. */
  status?: "active" | "discontinued" | "all";
  /** How many of the most recent administrations to include per order. */
  administrationsPerOrder?: number;
};

export type MedicationOrdersResult = {
  source: SourceRef;
  /** Active orders first, then discontinued, each newest first. */
  orders: Array<{
    id: string;
    medication: string;
    frequency: string;
    instructions: string | null;
    status: string;
    startedOn: string;
    endedOn: string | null;
    prescribedBy: string | null;
    /** The condition the order treats, when one is recorded. */
    treats: { id: string; description: string } | null;
    /** When the medication was last given, or null if never. */
    lastGivenAt: string | null;
    /** The most recent administrations, newest first. */
    recentAdministrations: Array<{
      id: string;
      administeredAt: string;
      status: string;
      administeredBy: string | null;
      notes: string | null;
    }>;
  }>;
  total: number;
};

/**
 * A resident's medication orders with each one's most recent administrations, so "is she on
 * anything for pain" and "when was it last given" are one call. Null when no resident is visible.
 */
export async function getMedicationOrders(
  { supabase }: ToolContext,
  {
    residentId,
    status = "active",
    administrationsPerOrder = ADMINISTRATIONS_PER_ORDER,
  }: MedicationOrdersInput,
): Promise<MedicationOrdersResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  let ordersQuery = supabase
    .from("medication_orders")
    .select(withStaff("medication_orders_prescribed_by_fkey"))
    .eq("resident_id", residentId)
    .is("archived_at", null);
  if (status !== "all") ordersQuery = ordersQuery.eq("status", status);
  const [orders, conditions] = await Promise.all([
    ordersQuery.order("status", { ascending: true }).order("started_on", { ascending: false }),
    loadConditions(supabase, residentId),
  ]);
  if (orders.error) throw new Error(`Could not load medication orders: ${orders.error.message}`);
  const rows = orders.data ?? [];

  const administrationsByOrder = new Map<string, Tables<"administrations">[]>();
  const attributed = new Map<string, StaffName | null>();
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from("administrations")
      .select(withStaff("administrations_administered_by_fkey"))
      .eq("resident_id", residentId)
      .is("archived_at", null)
      .in(
        "medication_order_id",
        rows.map((row) => row.id),
      )
      .order("administered_at", { ascending: false })
      .limit(ADMINISTRATIONS_CAP);
    if (error) throw new Error(`Could not load administrations: ${error.message}`);
    for (const administration of data ?? []) {
      const list = administrationsByOrder.get(administration.medication_order_id) ?? [];
      list.push(administration);
      administrationsByOrder.set(administration.medication_order_id, list);
      attributed.set(administration.id, administration.staff);
    }
  }

  const conditionById = new Map(conditions.map((condition) => [condition.id, condition]));
  const perOrder = Math.max(0, administrationsPerOrder);

  return {
    source: sourceFor(resident, "medications"),
    orders: rows.map((row) => {
      const administrations = administrationsByOrder.get(row.id) ?? [];
      const condition = row.condition_id ? conditionById.get(row.condition_id) : undefined;
      return {
        id: row.id,
        medication: row.medication,
        frequency: MEDICATION_FREQUENCY_LABELS[row.frequency],
        instructions: row.instructions,
        status: MEDICATION_ORDER_STATUS_LABELS[row.status],
        startedOn: row.started_on,
        endedOn: row.ended_on,
        prescribedBy: formatStaffName(row.staff),
        treats: condition ? { id: condition.id, description: condition.description } : null,
        lastGivenAt:
          administrations.find((administration) => administration.status === "given")
            ?.administered_at ?? null,
        recentAdministrations: administrations.slice(0, perOrder).map((administration) => ({
          id: administration.id,
          administeredAt: administration.administered_at,
          status: ADMINISTRATION_STATUS_LABELS[administration.status],
          administeredBy: formatStaffName(attributed.get(administration.id)),
          notes: administration.notes,
        })),
      };
    }),
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------------------------
// get_vitals
// ---------------------------------------------------------------------------------------------

export type VitalsInput = {
  residentId: string;
  /** How many of the most recent sets, up to `VITALS_MAX_LIMIT`. */
  limit?: number;
  /** Only sets taken at or after this instant (ISO 8601). */
  since?: string;
};

export type VitalsResult = {
  source: SourceRef;
  /** Newest first. */
  vitals: Array<{
    id: string;
    takenAt: string;
    takenBy: string | null;
    bloodPressure: string;
    systolic: number;
    diastolic: number;
    pulse: number;
    temperatureF: number;
    respiratoryRate: number;
    oxygenSaturation: number;
    weightLb: number | null;
    notes: string | null;
    /** The readings outside their normal range, by label; empty when all are in range. */
    outOfRange: string[];
  }>;
  /** How many sets are on record in the window asked for. */
  total: number;
};

/** A resident's most recent vitals with out-of-range readings flagged. Null when none is visible. */
export async function getVitals(
  { supabase }: ToolContext,
  { residentId, limit = VITALS_LIMIT, since }: VitalsInput,
): Promise<VitalsResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  let query = supabase
    .from("vitals")
    .select(withStaff("vitals_taken_by_fkey"), { count: "exact" })
    .eq("resident_id", residentId)
    .is("archived_at", null);
  if (since) query = query.gte("taken_at", since);
  const { data, count, error } = await query
    .order("taken_at", { ascending: false })
    .limit(Math.min(Math.max(1, limit), VITALS_MAX_LIMIT));
  if (error) throw new Error(`Could not load vitals: ${error.message}`);

  return {
    source: sourceFor(resident, "vitals"),
    vitals: (data ?? []).map((row) => ({
      id: row.id,
      takenAt: row.taken_at,
      takenBy: formatStaffName(row.staff),
      bloodPressure: `${row.systolic}/${row.diastolic}`,
      systolic: row.systolic,
      diastolic: row.diastolic,
      pulse: row.pulse,
      temperatureF: row.temperature_f,
      respiratoryRate: row.respiratory_rate,
      oxygenSaturation: row.oxygen_saturation,
      weightLb: row.weight_lb,
      notes: row.notes,
      outOfRange: outOfRangeReadings(row).map((reading) => VITAL_LABELS[reading]),
    })),
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// get_allergies
// ---------------------------------------------------------------------------------------------

export type AllergiesResult = {
  source: SourceRef;
  /** Most severe first. */
  allergies: Array<{
    id: string;
    description: string;
    category: string;
    type: string;
    /** The medication substance, for medication allergies; null for food and environment. */
    substance: string | null;
    reaction: string | null;
    severity: string | null;
    notedOn: string;
  }>;
  total: number;
};

/** A resident's documented allergies and intolerances. Null when no resident is visible. */
export async function getAllergies(
  { supabase }: ToolContext,
  { residentId }: { residentId: string },
): Promise<AllergiesResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const { data, error } = await supabase
    .from("allergies")
    .select("*")
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .order("severity", { ascending: false, nullsFirst: false })
    .order("noted_on", { ascending: false });
  if (error) throw new Error(`Could not load allergies: ${error.message}`);

  const rows = data ?? [];
  return {
    source: sourceFor(resident, "allergies"),
    allergies: rows.map((row) => ({
      id: row.id,
      description: row.description,
      category: ALLERGY_CATEGORY_LABELS[row.category],
      type: ALLERGY_TYPE_LABELS[row.allergy_type],
      substance: row.substance,
      reaction: row.reaction,
      severity: row.severity ? ALLERGY_SEVERITY_LABELS[row.severity] : null,
      notedOn: row.noted_on,
    })),
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------------------------

function sourceFor(resident: ResidentDirectoryEntry, tab: RecordTabKey | null): SourceRef {
  return { residentId: resident.id, residentName: resident.full_name, tab };
}
