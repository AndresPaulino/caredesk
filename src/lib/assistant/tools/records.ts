import "server-only";

import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  FAMILY_RELATIONSHIP_LABELS,
  INCIDENT_KIND_LABELS,
} from "@/lib/clinical/labels";
import { formatStaffName } from "@/lib/format";
import { getResident } from "@/lib/residents/queries";
import type { Enums } from "@/lib/supabase/database.types";
import { dateInZone, daysBetween } from "@/lib/time";

import {
  calendar,
  contains,
  instantFrom,
  sourceFor,
  withStaff,
  type SourceRef,
  type ToolContext,
} from "./shared";

/**
 * The record tools: lab results, incidents, progress notes, appointments, and family
 * contacts, one resident at a time. Each mirrors its record tab and, like the core tools,
 * comes back null when no resident is visible.
 */

export const LAB_RESULTS_LIMIT = 20;
export const INCIDENTS_LIMIT = 20;
export const PROGRESS_NOTES_LIMIT = 10;
export const PROGRESS_NOTES_MAX_LIMIT = 50;
export const APPOINTMENTS_LIMIT = 20;
export const RECORDS_MAX_LIMIT = 100;

/** Falls counted over this many days, the window the fall-risk story uses. */
export const FALL_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------------------------
// get_lab_results
// ---------------------------------------------------------------------------------------------

export type LabResultsInput = {
  residentId: string;
  /** Part of a test name ("potassium", "A1c"); omitted for every test. */
  test?: string;
  /** Only results at or after this date or instant. */
  since?: string;
  limit?: number;
};

export type LabResultSummary = {
  id: string;
  test: string;
  code: string;
  value: number;
  units: string;
  /** "3.5 to 5.1 mmol/L", or null when the test has no reference range. */
  referenceRange: string | null;
  abnormal: boolean;
  resultedAt: string;
  resultedOn: string;
  daysAgo: number;
};

export type LabResultsResult = {
  source: SourceRef;
  /** Newest first, at most `limit` of `total`. */
  results: LabResultSummary[];
  /** The latest result of each test asked about, with the one before it for the trend. */
  latestByTest: Array<{
    test: string;
    code: string;
    latest: LabResultSummary;
    previous: Pick<LabResultSummary, "id" | "value" | "units" | "abnormal" | "resultedOn"> | null;
  }>;
  total: number;
};

/** A resident's lab results with the latest of each test, or null when none is visible. */
export async function getLabResults(
  { supabase, now }: ToolContext,
  { residentId, test, since, limit = LAB_RESULTS_LIMIT }: LabResultsInput,
): Promise<LabResultsResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  let query = supabase
    .from("lab_results")
    .select("*")
    .eq("resident_id", residentId)
    .is("archived_at", null);
  if (test?.trim()) query = query.ilike("description", contains(test));
  const sinceInstant = instantFrom(since, "since");
  if (sinceInstant) query = query.gte("resulted_at", sinceInstant);
  const { data, error } = await query.order("resulted_at", { ascending: false });
  if (error) throw new Error(`Could not load lab results: ${error.message}`);

  const rows = (data ?? []).map((row) => {
    const { on, daysAgo } = calendar(row.resulted_at, now);
    return {
      id: row.id,
      test: row.description,
      code: row.code,
      value: row.value,
      units: row.units,
      referenceRange:
        row.reference_low !== null && row.reference_high !== null
          ? `${row.reference_low} to ${row.reference_high} ${row.units}`.trimEnd()
          : null,
      abnormal: row.abnormal,
      resultedAt: row.resulted_at,
      resultedOn: on,
      daysAgo,
    };
  });

  const byCode = new Map<string, LabResultSummary[]>();
  for (const row of rows) {
    const list = byCode.get(row.code) ?? [];
    list.push(row);
    byCode.set(row.code, list);
  }

  return {
    source: sourceFor(resident, "labs"),
    results: rows.slice(0, Math.min(Math.max(1, limit), RECORDS_MAX_LIMIT)),
    latestByTest: [...byCode.values()].map(([latest, previous]) => ({
      test: latest.test,
      code: latest.code,
      latest,
      previous: previous
        ? {
            id: previous.id,
            value: previous.value,
            units: previous.units,
            abnormal: previous.abnormal,
            resultedOn: previous.resultedOn,
          }
        : null,
    })),
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------------------------
// get_incidents
// ---------------------------------------------------------------------------------------------

export type IncidentsInput = {
  residentId: string;
  kind?: Enums<"incident_kind">;
  /** Only incidents at or after this date or instant. */
  since?: string;
  limit?: number;
};

export type IncidentsResult = {
  source: SourceRef;
  /** Newest first, at most `limit` of `total`. */
  incidents: Array<{
    id: string;
    kind: Enums<"incident_kind">;
    kindName: string;
    occurredAt: string;
    occurredOn: string;
    daysAgo: number;
    description: string;
    injurySustained: boolean;
    reportedBy: string | null;
  }>;
  total: number;
  /** Falls in the last `FALL_WINDOW_DAYS` days, whatever the filter. */
  fallsInLast30Days: number;
};

/** A resident's incident reports, with the recent fall count. Null when none is visible. */
export async function getIncidents(
  { supabase, now }: ToolContext,
  { residentId, kind, since, limit = INCIDENTS_LIMIT }: IncidentsInput,
): Promise<IncidentsResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const { data, error } = await supabase
    .from("incidents")
    .select(withStaff("incidents_reported_by_fkey"))
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(`Could not load incidents: ${error.message}`);

  const today = dateInZone(now);
  const all = (data ?? []).map((row) => {
    const { on, daysAgo } = calendar(row.occurred_at, now);
    return {
      id: row.id,
      kind: row.kind,
      kindName: INCIDENT_KIND_LABELS[row.kind],
      occurredAt: row.occurred_at,
      occurredOn: on,
      daysAgo,
      description: row.description,
      injurySustained: row.injury_sustained,
      reportedBy: formatStaffName(row.staff),
    };
  });
  const sinceInstant = instantFrom(since, "since");
  const matching = all.filter(
    (row) => (!kind || row.kind === kind) && (!sinceInstant || row.occurredAt >= sinceInstant),
  );

  return {
    source: sourceFor(resident, "incidents"),
    incidents: matching.slice(0, Math.min(Math.max(1, limit), RECORDS_MAX_LIMIT)),
    total: matching.length,
    fallsInLast30Days: all.filter(
      (row) => row.kind === "fall" && daysBetween(row.occurredOn, today) <= FALL_WINDOW_DAYS,
    ).length,
  };
}

// ---------------------------------------------------------------------------------------------
// get_progress_notes
// ---------------------------------------------------------------------------------------------

export type ProgressNotesInput = {
  residentId: string;
  /** Only notes written at or after this date or instant. */
  since?: string;
  /** Only notes mentioning this text ("daughter", "appetite"). */
  search?: string;
  limit?: number;
};

export type ProgressNotesResult = {
  source: SourceRef;
  /** Newest first, at most `limit` of `total`. */
  notes: Array<{
    id: string;
    writtenAt: string;
    writtenOn: string;
    daysAgo: number;
    writtenBy: string | null;
    body: string;
  }>;
  total: number;
};

/** A resident's progress notes, newest first. Null when no resident is visible. */
export async function getProgressNotes(
  { supabase, now }: ToolContext,
  { residentId, since, search, limit = PROGRESS_NOTES_LIMIT }: ProgressNotesInput,
): Promise<ProgressNotesResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  let query = supabase
    .from("progress_notes")
    .select(withStaff("progress_notes_written_by_fkey"), { count: "exact" })
    .eq("resident_id", residentId)
    .is("archived_at", null);
  const sinceInstant = instantFrom(since, "since");
  if (sinceInstant) query = query.gte("written_at", sinceInstant);
  if (search?.trim()) query = query.ilike("body", contains(search));
  const { data, count, error } = await query
    .order("written_at", { ascending: false })
    .limit(Math.min(Math.max(1, limit), PROGRESS_NOTES_MAX_LIMIT));
  if (error) throw new Error(`Could not load progress notes: ${error.message}`);

  return {
    source: sourceFor(resident, "notes"),
    notes: (data ?? []).map((row) => {
      const { on, daysAgo } = calendar(row.written_at, now);
      return {
        id: row.id,
        writtenAt: row.written_at,
        writtenOn: on,
        daysAgo,
        writtenBy: formatStaffName(row.staff),
        body: row.body,
      };
    }),
    total: count ?? 0,
  };
}

// ---------------------------------------------------------------------------------------------
// get_appointments
// ---------------------------------------------------------------------------------------------

export type AppointmentsInput = {
  residentId: string;
  /** Upcoming appointments (scheduled, from now on), past ones, or all; all by default. */
  window?: "upcoming" | "past" | "all";
  kind?: Enums<"appointment_kind">;
  status?: Enums<"appointment_status">;
  limit?: number;
};

export type AppointmentSummary = {
  id: string;
  kind: Enums<"appointment_kind">;
  kindName: string;
  scheduledAt: string;
  scheduledOn: string;
  /** Negative for a past appointment. */
  daysFromNow: number;
  location: string;
  purpose: string;
  status: string;
  scheduledBy: string | null;
};

export type AppointmentsResult = {
  source: SourceRef;
  /** Soonest first for upcoming appointments, newest first otherwise; at most `limit` of `total`. */
  appointments: AppointmentSummary[];
  /** The next scheduled appointment, whatever the filter. */
  nextScheduled: AppointmentSummary | null;
  total: number;
};

/** A resident's appointments and the next one scheduled. Null when no resident is visible. */
export async function getAppointments(
  { supabase, now }: ToolContext,
  { residentId, window = "all", kind, status, limit = APPOINTMENTS_LIMIT }: AppointmentsInput,
): Promise<AppointmentsResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const { data, error } = await supabase
    .from("appointments")
    .select(withStaff("appointments_scheduled_by_fkey"))
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .order("scheduled_at", { ascending: false });
  if (error) throw new Error(`Could not load appointments: ${error.message}`);

  const today = dateInZone(now);
  const nowIso = now.toISOString();
  const rows = data ?? [];
  const statusById = new Map(rows.map((row) => [row.id, row.status]));
  const all: AppointmentSummary[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    kindName: APPOINTMENT_KIND_LABELS[row.kind],
    scheduledAt: row.scheduled_at,
    scheduledOn: dateInZone(new Date(row.scheduled_at)),
    daysFromNow: daysBetween(today, dateInZone(new Date(row.scheduled_at))),
    location: row.location,
    purpose: row.purpose,
    status: APPOINTMENT_STATUS_LABELS[row.status],
    scheduledBy: formatStaffName(row.staff),
  }));

  const upcoming = all
    .filter((row) => statusById.get(row.id) === "scheduled" && row.scheduledAt >= nowIso)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const matching = (
    window === "upcoming"
      ? upcoming
      : window === "past"
        ? all.filter((row) => row.scheduledAt < nowIso)
        : all
  ).filter((row) => (!kind || row.kind === kind) && (!status || statusById.get(row.id) === status));

  return {
    source: sourceFor(resident, "appointments"),
    appointments: matching.slice(0, Math.min(Math.max(1, limit), RECORDS_MAX_LIMIT)),
    nextScheduled: upcoming[0] ?? null,
    total: matching.length,
  };
}

// ---------------------------------------------------------------------------------------------
// get_family_contacts
// ---------------------------------------------------------------------------------------------

export type FamilyContactSummary = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
};

export type FamilyContactsResult = {
  source: SourceRef;
  /** The primary contact first, then by last name. */
  contacts: FamilyContactSummary[];
  primaryContact: FamilyContactSummary | null;
  total: number;
};

/** A resident's family contacts and who to call first. Null when no resident is visible. */
export async function getFamilyContacts(
  { supabase }: ToolContext,
  { residentId }: { residentId: string },
): Promise<FamilyContactsResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const { data, error } = await supabase
    .from("family_contacts")
    .select("*")
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .order("is_primary", { ascending: false })
    .order("last_name")
    .order("first_name");
  if (error) throw new Error(`Could not load family contacts: ${error.message}`);

  const contacts = (data ?? []).map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`,
    firstName: row.first_name,
    lastName: row.last_name,
    relationship: FAMILY_RELATIONSHIP_LABELS[row.relationship],
    phone: row.phone,
    email: row.email,
    isPrimary: row.is_primary,
    notes: row.notes,
  }));

  return {
    source: sourceFor(resident, "family"),
    contacts,
    primaryContact: contacts.find((contact) => contact.isPrimary) ?? null,
    total: contacts.length,
  };
}
