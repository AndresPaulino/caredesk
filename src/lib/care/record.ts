import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { dateInZone } from "@/lib/time";

import type {
  AdministrationInput,
  AllergyInput,
  AppointmentInput,
  FamilyContactInput,
  IncidentInput,
  MedicationOrderInput,
  ProgressNoteInput,
  ResidentDetailsInput,
  VitalsInput,
} from "./schemas";
import { findAllergen, findMedication } from "./vocabulary";

/**
 * Recording care: every write a nurse makes from the resident page, as functions over the
 * caller's own Supabase client. Scope is not checked here and cannot be bypassed here: each
 * write runs as the signed-in staff member and Row Level Security decides whether it lands
 * (ADR 0003). A write for a resident outside scope is rejected by the database and comes back
 * as an error; an update that matches no visible row comes back as "not found".
 *
 * Nothing is ever deleted. Removing an appointment, contact, or allergy archives it, so it
 * leaves the default views and stays in the database for the audit trail (ticket 06).
 */

export type CareClient = SupabaseClient<Database>;

/** The staff member doing the recording. Their id is written as the actor on every record. */
export type Actor = { staffId: string };

export type CareError = {
  kind: "forbidden" | "not_found" | "invalid" | "failed";
  message: string;
  /** The form field the message belongs to, when there is one. */
  field?: string;
};

export type CareResult = { ok: true; id: string } | { ok: false; error: CareError };

export type ArchivableTable = "appointments" | "family_contacts" | "allergies";

const ARCHIVABLE_LABELS: Readonly<Record<ArchivableTable, string>> = {
  appointments: "appointment",
  family_contacts: "family contact",
  allergies: "allergy",
};

// ---------------------------------------------------------------------------------------------
// Resident details
// ---------------------------------------------------------------------------------------------

export async function updateResidentDetails(
  supabase: CareClient,
  residentId: string,
  input: ResidentDetailsInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("residents")
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      date_of_birth: input.date_of_birth,
      sex: input.sex,
      admission_date: input.admission_date,
      status: input.status,
      stay_ended_on: input.stay_ended_on,
      stay_end_reason: input.stay_end_reason,
      code_status: input.code_status,
      diet: input.diet,
      mobility: input.mobility,
      unit_id: input.unit_id,
      room_id: input.room_id,
    })
    .eq("id", residentId)
    .is("archived_at", null)
    .select("id");
  if (error) return failed(error, "update the resident", RESIDENT_ERRORS);
  return updated(data, "resident");
}

/** What the residents table's own rules mean to the person editing the form. */
const RESIDENT_ERRORS: ErrorTranslations = {
  forbidden: "You can only move a resident to a unit you cover.",
  byHint: { room_full: { field: "room_id" } },
  byConstraint: {
    residents_room_id_unit_id_fkey: {
      field: "room_id",
      message: "Choose a room on the chosen unit.",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Vitals, notes, incidents
// ---------------------------------------------------------------------------------------------

export async function recordVitals(
  supabase: CareClient,
  actor: Actor,
  residentId: string,
  input: VitalsInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("vitals")
    .insert({
      resident_id: residentId,
      taken_by: actor.staffId,
      taken_at: input.taken_at,
      systolic: input.systolic,
      diastolic: input.diastolic,
      pulse: input.pulse,
      temperature_f: input.temperature_f,
      respiratory_rate: input.respiratory_rate,
      oxygen_saturation: input.oxygen_saturation,
      weight_lb: input.weight_lb ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return failed(error, "record the vitals");
  return { ok: true, id: data.id };
}

export async function writeProgressNote(
  supabase: CareClient,
  actor: Actor,
  residentId: string,
  input: ProgressNoteInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("progress_notes")
    .insert({
      resident_id: residentId,
      written_by: actor.staffId,
      written_at: input.written_at,
      body: input.body,
    })
    .select("id")
    .single();
  if (error) return failed(error, "write the note");
  return { ok: true, id: data.id };
}

export async function reportIncident(
  supabase: CareClient,
  actor: Actor,
  residentId: string,
  input: IncidentInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("incidents")
    .insert({
      resident_id: residentId,
      reported_by: actor.staffId,
      kind: input.kind,
      occurred_at: input.occurred_at,
      description: input.description,
      injury_sustained: input.injury_sustained,
    })
    .select("id")
    .single();
  if (error) return failed(error, "report the incident");
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------------------------
// Medication orders and administrations
// ---------------------------------------------------------------------------------------------

export async function addMedicationOrder(
  supabase: CareClient,
  residentId: string,
  input: MedicationOrderInput,
): Promise<CareResult> {
  const medication = findMedication(input.medication);
  if (!medication) {
    return invalid("medication", "Choose a medication from the formulary list.");
  }

  const prescriber = await supabase
    .from("staff")
    .select("id")
    .eq("id", input.prescribed_by)
    .eq("role", "physician")
    .is("archived_at", null)
    .maybeSingle();
  if (prescriber.error) return failed(prescriber.error, "add the order");
  if (!prescriber.data) return invalid("prescribed_by", "Choose the prescribing physician.");

  const { data, error } = await supabase
    .from("medication_orders")
    .insert({
      resident_id: residentId,
      code: medication.code,
      code_system: medication.system,
      medication: medication.name,
      frequency: input.frequency,
      instructions: input.instructions ?? null,
      condition_id: input.condition_id ?? null,
      prescribed_by: input.prescribed_by,
      started_on: input.started_on,
    })
    .select("id")
    .single();
  if (error) return failed(error, "add the order", ORDER_ERRORS);
  return { ok: true, id: data.id };
}

const ORDER_ERRORS: ErrorTranslations = {
  byConstraint: {
    medication_orders_condition_id_resident_id_fkey: {
      field: "condition_id",
      message: "Choose a condition on this resident's record.",
    },
  },
};

/** Ends an active order today. An order already discontinued is left as it is. */
export async function discontinueMedicationOrder(
  supabase: CareClient,
  residentId: string,
  orderId: string,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("medication_orders")
    .update({ status: "discontinued", ended_on: dateInZone(new Date()) })
    .eq("id", orderId)
    .eq("resident_id", residentId)
    .eq("status", "active")
    .is("archived_at", null)
    .select("id");
  if (error) return failed(error, "discontinue the order");
  return updated(data, "active medication order");
}

/** One dose given, refused, or held, right now, by the signed-in staff member. */
export async function recordAdministration(
  supabase: CareClient,
  actor: Actor,
  residentId: string,
  input: AdministrationInput,
): Promise<CareResult> {
  const order = await supabase
    .from("medication_orders")
    .select("status")
    .eq("id", input.medication_order_id)
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .maybeSingle();
  if (order.error) return failed(order.error, "record the administration");
  if (!order.data) return notFound("medication order");
  if (order.data.status !== "active") {
    return invalid("medication_order_id", "This order has been discontinued.");
  }

  const { data, error } = await supabase
    .from("administrations")
    .insert({
      resident_id: residentId,
      medication_order_id: input.medication_order_id,
      administered_at: new Date().toISOString(),
      administered_by: actor.staffId,
      status: input.status,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) return failed(error, "record the administration");
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------------------------

export async function scheduleAppointment(
  supabase: CareClient,
  actor: Actor,
  residentId: string,
  input: AppointmentInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      resident_id: residentId,
      scheduled_by: actor.staffId,
      kind: input.kind,
      scheduled_at: input.scheduled_at,
      location: input.location,
      purpose: input.purpose,
    })
    .select("id")
    .single();
  if (error) return failed(error, "schedule the appointment");
  return { ok: true, id: data.id };
}

/** Cancels a scheduled appointment. It stays on the record, marked cancelled. */
export async function cancelAppointment(
  supabase: CareClient,
  residentId: string,
  appointmentId: string,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", appointmentId)
    .eq("resident_id", residentId)
    .eq("status", "scheduled")
    .is("archived_at", null)
    .select("id");
  if (error) return failed(error, "cancel the appointment");
  return updated(data, "scheduled appointment");
}

// ---------------------------------------------------------------------------------------------
// Family contacts
// ---------------------------------------------------------------------------------------------

export async function addFamilyContact(
  supabase: CareClient,
  residentId: string,
  input: FamilyContactInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("family_contacts")
    .insert({ resident_id: residentId, ...contactColumns(input) })
    .select("id")
    .single();
  if (error) return failed(error, "add the contact");
  if (input.is_primary) {
    const demoted = await demoteOtherPrimaryContacts(supabase, residentId, data.id);
    if (demoted) return demoted;
  }
  return { ok: true, id: data.id };
}

export async function updateFamilyContact(
  supabase: CareClient,
  residentId: string,
  contactId: string,
  input: FamilyContactInput,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from("family_contacts")
    .update(contactColumns(input))
    .eq("id", contactId)
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .select("id");
  if (error) return failed(error, "update the contact");
  const result = updated(data, "family contact");
  if (!result.ok) return result;
  if (input.is_primary) {
    const demoted = await demoteOtherPrimaryContacts(supabase, residentId, contactId);
    if (demoted) return demoted;
  }
  return result;
}

function contactColumns(input: FamilyContactInput) {
  return {
    first_name: input.first_name,
    last_name: input.last_name,
    relationship: input.relationship,
    phone: input.phone,
    email: input.email ?? null,
    is_primary: input.is_primary,
    notes: input.notes ?? null,
  };
}

/** A resident has at most one primary contact: making one primary demotes the others. */
async function demoteOtherPrimaryContacts(
  supabase: CareClient,
  residentId: string,
  contactId: string,
): Promise<CareResult | null> {
  const { error } = await supabase
    .from("family_contacts")
    .update({ is_primary: false })
    .eq("resident_id", residentId)
    .eq("is_primary", true)
    .neq("id", contactId);
  return error ? failed(error, "update the other contacts") : null;
}

// ---------------------------------------------------------------------------------------------
// Allergies
// ---------------------------------------------------------------------------------------------

export async function addAllergy(
  supabase: CareClient,
  residentId: string,
  input: AllergyInput,
): Promise<CareResult> {
  const allergen = findAllergen(input.code);
  if (!allergen) return invalid("code", "Choose an allergen from the list.");

  const { data, error } = await supabase
    .from("allergies")
    .insert({
      resident_id: residentId,
      code: allergen.code,
      description: allergen.name,
      category: allergen.category,
      allergy_type: input.allergy_type,
      substance: allergen.substance,
      reaction: input.reaction ?? null,
      severity: input.severity ?? null,
      noted_on: input.noted_on,
    })
    .select("id")
    .single();
  if (error) return failed(error, "add the allergy");
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------------------------
// Archiving
// ---------------------------------------------------------------------------------------------

/** Removes a record from the default views by stamping `archived_at`. The row stays. */
export async function archiveRecord(
  supabase: CareClient,
  table: ArchivableTable,
  residentId: string,
  recordId: string,
): Promise<CareResult> {
  const { data, error } = await supabase
    .from(table)
    .update({ archived_at: new Date().toISOString() })
    .eq("id", recordId)
    .eq("resident_id", residentId)
    .is("archived_at", null)
    .select("id");
  if (error) return failed(error, `remove the ${ARCHIVABLE_LABELS[table]}`);
  return updated(data, ARCHIVABLE_LABELS[table]);
}

// ---------------------------------------------------------------------------------------------
// Results and errors
// ---------------------------------------------------------------------------------------------

type ErrorTranslations = {
  /** What a policy rejection means for this write. */
  forbidden?: string;
  /** Errors a trigger raised with a hint, by hint. */
  byHint?: Record<string, { field?: string; message?: string }>;
  /** Constraint violations, by constraint name. */
  byConstraint?: Record<string, { field?: string; message?: string }>;
};

const DEFAULT_FORBIDDEN = "You can only record care for residents in your scope.";

function invalid(field: string, message: string): CareResult {
  return { ok: false, error: { kind: "invalid", field, message } };
}

function notFound(label: string): CareResult {
  return {
    ok: false,
    error: {
      kind: "not_found",
      message: `No ${label} was found to change. It may have been changed by someone else; reload the page.`,
    },
  };
}

/** An update's result: one row changed, or nothing visible matched. */
function updated(rows: Array<{ id: string }> | null, label: string): CareResult {
  const row = rows?.[0];
  return row ? { ok: true, id: row.id } : notFound(label);
}

/**
 * Turns a database error into something the form can show. Policy rejections are the scope
 * boundary (ADR 0003); constraint and trigger errors are the database's own rules, some of
 * which belong to a specific field.
 */
function failed(
  error: PostgrestError,
  action: string,
  translations: ErrorTranslations = {},
): CareResult {
  if (error.code === "42501") {
    return {
      ok: false,
      error: { kind: "forbidden", message: translations.forbidden ?? DEFAULT_FORBIDDEN },
    };
  }

  const hinted = error.hint ? translations.byHint?.[error.hint] : undefined;
  if (hinted) {
    return {
      ok: false,
      error: {
        kind: "invalid",
        field: hinted.field,
        message: hinted.message ?? `${error.message}.`,
      },
    };
  }

  const constraint = constraintNamed(error, translations.byConstraint);
  if (constraint) {
    return {
      ok: false,
      error: {
        kind: "invalid",
        field: constraint.field,
        message: constraint.message ?? `${error.message}.`,
      },
    };
  }

  return { ok: false, error: { kind: "failed", message: `Could not ${action}: ${error.message}` } };
}

function constraintNamed(
  error: PostgrestError,
  byConstraint: ErrorTranslations["byConstraint"],
): { field?: string; message?: string } | undefined {
  if (!byConstraint) return undefined;
  const text = `${error.message} ${error.details ?? ""}`;
  const name = Object.keys(byConstraint).find((constraint) => text.includes(constraint));
  return name ? byConstraint[name] : undefined;
}
