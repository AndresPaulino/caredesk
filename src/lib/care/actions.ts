"use server";

import { refresh } from "next/cache";

import { requireStaff } from "@/lib/auth/current-staff";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import * as care from "./record";
import {
  administrationSchema,
  allergySchema,
  appointmentSchema,
  familyContactSchema,
  incidentSchema,
  medicationOrderSchema,
  parseForm,
  progressNoteSchema,
  recordIdSchema,
  residentDetailsSchema,
  residentIdSchema,
  vitalsSchema,
  type FormState,
  type ParsedForm,
} from "./schemas";

/**
 * The server actions behind the recording-care forms. Each one authenticates, validates the
 * submitted fields against the same zod schema the form used, writes through the signed-in
 * staff member's session, and refreshes the resident page so the change shows at once.
 *
 * Every action takes the previous form state and the submitted form data, as `useActionState`
 * expects. The resident is named by a hidden `resident_id` field.
 */

type Context = {
  staffId: string;
  supabase: care.CareClient;
  residentId: string;
};

type WithContext = (context: Context) => Promise<care.CareResult>;

const BAD_RESIDENT: FormState = {
  status: "error",
  message: "This form is not attached to a resident. Reload the page and try again.",
};

/** Signs the caller in, reads the resident id, and turns the write's result into form state. */
async function perform(
  formData: FormData,
  successMessage: string,
  write: WithContext,
): Promise<FormState> {
  const staff = await requireStaff();
  const residentId = residentIdSchema.safeParse(formData.get("resident_id"));
  if (!residentId.success) return BAD_RESIDENT;

  const supabase = await createSupabaseServerClient();
  const result = await write({ staffId: staff.id, supabase, residentId: residentId.data });

  if (result.ok) {
    refresh();
    return { status: "success", message: successMessage, id: result.id };
  }
  if (result.error.field) {
    return { status: "invalid", fieldErrors: { [result.error.field]: [result.error.message] } };
  }
  return { status: "error", message: result.error.message };
}

/** Parses the form; on failure the field errors are the form state. */
function validated<T>(
  parsed: ParsedForm<T>,
): { ok: true; data: T } | { ok: false; state: FormState } {
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, state: { status: "invalid", fieldErrors: parsed.fieldErrors } };
}

export async function updateResidentDetailsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(residentDetailsSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Resident details saved.", ({ supabase, residentId }) =>
    care.updateResidentDetails(supabase, residentId, input.data),
  );
}

export async function recordVitalsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(vitalsSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Vitals recorded.", ({ supabase, staffId, residentId }) =>
    care.recordVitals(supabase, { staffId }, residentId, input.data),
  );
}

export async function addMedicationOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(medicationOrderSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Medication order added.", ({ supabase, residentId }) =>
    care.addMedicationOrder(supabase, residentId, input.data),
  );
}

export async function discontinueMedicationOrderAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(recordIdSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Medication order discontinued.", ({ supabase, residentId }) =>
    care.discontinueMedicationOrder(supabase, residentId, input.data.id),
  );
}

export async function recordAdministrationAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(administrationSchema, formData));
  if (!input.ok) return input.state;
  const message = {
    given: "Marked as given.",
    refused: "Marked as refused.",
    held: "Marked as held.",
  }[input.data.status];
  return perform(formData, message, ({ supabase, staffId, residentId }) =>
    care.recordAdministration(supabase, { staffId }, residentId, input.data),
  );
}

export async function writeProgressNoteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(progressNoteSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Progress note written.", ({ supabase, staffId, residentId }) =>
    care.writeProgressNote(supabase, { staffId }, residentId, input.data),
  );
}

export async function reportIncidentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(incidentSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Incident reported.", ({ supabase, staffId, residentId }) =>
    care.reportIncident(supabase, { staffId }, residentId, input.data),
  );
}

export async function scheduleAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(appointmentSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Appointment scheduled.", ({ supabase, staffId, residentId }) =>
    care.scheduleAppointment(supabase, { staffId }, residentId, input.data),
  );
}

export async function cancelAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(recordIdSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Appointment cancelled.", ({ supabase, residentId }) =>
    care.cancelAppointment(supabase, residentId, input.data.id),
  );
}

export async function addFamilyContactAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(familyContactSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Family contact added.", ({ supabase, residentId }) =>
    care.addFamilyContact(supabase, residentId, input.data),
  );
}

export async function updateFamilyContactAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = validated(parseForm(recordIdSchema, formData));
  if (!id.ok) return id.state;
  const input = validated(parseForm(familyContactSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Family contact updated.", ({ supabase, residentId }) =>
    care.updateFamilyContact(supabase, residentId, id.data.id, input.data),
  );
}

export async function addAllergyAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(allergySchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, "Allergy added.", ({ supabase, residentId }) =>
    care.addAllergy(supabase, residentId, input.data),
  );
}

export async function archiveAppointmentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return archive("appointments", "Appointment removed.", formData);
}

export async function archiveFamilyContactAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return archive("family_contacts", "Family contact removed.", formData);
}

export async function archiveAllergyAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return archive("allergies", "Allergy removed.", formData);
}

async function archive(
  table: care.ArchivableTable,
  message: string,
  formData: FormData,
): Promise<FormState> {
  const input = validated(parseForm(recordIdSchema, formData));
  if (!input.ok) return input.state;
  return perform(formData, message, ({ supabase, residentId }) =>
    care.archiveRecord(supabase, table, residentId, input.data.id),
  );
}
