/**
 * What a nurse may record, as zod schemas. Each form validates against its schema in the
 * browser for instant feedback, and the server action validates the same schema again before
 * writing (ADR 0004: forms and the server share one definition). Messages are written for the
 * person filling in the form and are shown next to the field they concern.
 *
 * Times typed into a form are wall-clock times in the facilities' time zone, because that is
 * the clock every other time on the page is shown in; they become instants here.
 */
import { z } from "zod";

import {
  ADMINISTRATION_STATUS_LABELS,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
  APPOINTMENT_KIND_LABELS,
  FAMILY_RELATIONSHIP_LABELS,
  INCIDENT_KIND_LABELS,
} from "@/lib/clinical/labels";
import { MEDICATION_FREQUENCY_LABELS } from "@/lib/clinical/medication-schedule";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  RESIDENT_STATUS_LABELS,
  STAY_END_REASON_LABELS,
} from "@/lib/residents/labels";
import type { Enums } from "@/lib/supabase/database.types";
import { atZoned, dateInZone } from "@/lib/time";

// ---------------------------------------------------------------------------------------------
// Form data and form state
// ---------------------------------------------------------------------------------------------

export type FormValues = Record<string, string | undefined>;

/**
 * The fields of a submitted form as trimmed strings, with empty fields left out so an optional
 * schema sees `undefined` rather than `""`. Files and the framework's own fields are ignored.
 */
export function formValues(formData: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || typeof value !== "string") continue;
    const trimmed = value.trim();
    values[key] = trimmed === "" ? undefined : trimmed;
  }
  return values;
}

/** Messages per field name. `_form` holds messages that belong to no single field. */
export type FieldErrors = Record<string, string[]>;

export type ParsedForm<T> =
  { success: true; data: T } | { success: false; fieldErrors: FieldErrors };

export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): ParsedForm<z.output<S>> {
  const result = schema.safeParse(formValues(formData));
  if (result.success) return { success: true, data: result.data };

  const flat = z.flattenError(result.error) as {
    formErrors: string[];
    fieldErrors: Record<string, string[] | undefined>;
  };
  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (messages && messages.length > 0) fieldErrors[field] = messages;
  }
  if (flat.formErrors.length > 0) fieldErrors._form = flat.formErrors;
  return { success: false, fieldErrors };
}

/** What a form action returns, and what the form renders from. */
export type FormState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: FieldErrors }
  | { status: "error"; message: string }
  | { status: "success"; message: string; id?: string };

export const IDLE_FORM_STATE: FormState = { status: "idle" };

// ---------------------------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------------------------

/** Submissions a few minutes ahead of the server clock are not "in the future". */
const CLOCK_SKEW_MS = 5 * 60_000;

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function enumOf<K extends string>(labels: Readonly<Record<K, string>>, message: string) {
  return z.enum(Object.keys(labels) as [K, ...K[]], { error: message });
}

function text(label: string, max: number) {
  return z
    .string({ error: `Enter ${label}` })
    .max(max, { error: `Keep ${label} under ${max.toLocaleString("en-US")} characters` });
}

function uuid(message: string) {
  return z.uuid({ error: message });
}

function wholeNumber(label: string, low: number, high: number) {
  const message = `Enter ${label} as a whole number from ${low} to ${high}`;
  return z.coerce
    .number({ error: message })
    .int({ error: message })
    .min(low, message)
    .max(high, message);
}

function decimalNumber(label: string, low: number, high: number) {
  const message = `Enter ${label} between ${low} and ${high}`;
  return z.coerce
    .number({ error: message })
    .min(low, message)
    .max(high, message)
    .transform((value) => Math.round(value * 10) / 10);
}

/** A checked checkbox submits "on"; an unchecked one submits nothing. */
const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on");

/** A `YYYY-MM-DD` date that is a real calendar date. */
function calendarDate(label: string) {
  return z.iso.date({ error: `Enter the ${label}` });
}

function notFutureDate(label: string) {
  return calendarDate(label).refine((date) => date <= dateInZone(new Date()), {
    error: `The ${label} cannot be in the future`,
  });
}

/** A `datetime-local` value, read as a wall-clock time in the facilities' time zone. */
function instant(label: string) {
  return z
    .string({ error: `Enter the ${label}` })
    .regex(DATETIME_LOCAL, { error: `Enter the ${label}` })
    .transform((value, ctx) => {
      const [date, time] = value.split("T");
      const [hour, minute] = time.split(":").map(Number);
      const result = atZoned(date, hour, minute);
      if (dateInZone(result) !== date) {
        ctx.addIssue({ code: "custom", message: `Enter a real date for the ${label}` });
        return z.NEVER;
      }
      return result;
    });
}

function pastInstant(label: string) {
  return instant(label)
    .refine((value) => value.getTime() <= Date.now() + CLOCK_SKEW_MS, {
      error: `The ${label} cannot be in the future`,
    })
    .transform((value) => value.toISOString());
}

function futureInstant(label: string) {
  return instant(label)
    .refine((value) => value.getTime() > Date.now(), {
      error: `The ${label} must be in the future`,
    })
    .transform((value) => value.toISOString());
}

// ---------------------------------------------------------------------------------------------
// Resident details
// ---------------------------------------------------------------------------------------------

const EARLIEST_BIRTH_DATE = "1900-01-01";

/** What the form resolves to: a stay end only for a former resident, a room only for a current one. */
export type ResidentDetailsInput = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: "female" | "male";
  admission_date: string;
  status: Enums<"resident_status">;
  stay_ended_on: string | null;
  stay_end_reason: Enums<"stay_end_reason"> | null;
  code_status: Enums<"code_status">;
  diet: Enums<"diet">;
  mobility: Enums<"mobility">;
  unit_id: string;
  room_id: string | null;
};

export const residentDetailsSchema = z
  .object({
    first_name: text("the first name", 60),
    last_name: text("the last name", 60),
    date_of_birth: calendarDate("date of birth").refine(
      (date) => date >= EARLIEST_BIRTH_DATE && date < dateInZone(new Date()),
      { error: "Enter a date of birth in the past" },
    ),
    sex: z.enum(["female", "male"], { error: "Choose a sex" }),
    admission_date: notFutureDate("admission date"),
    status: enumOf(RESIDENT_STATUS_LABELS, "Choose a status"),
    stay_ended_on: calendarDate("date the stay ended").optional(),
    stay_end_reason: enumOf(STAY_END_REASON_LABELS, "Choose how the stay ended").optional(),
    code_status: enumOf(CODE_STATUS_LABELS, "Choose a code status"),
    diet: enumOf(DIET_LABELS, "Choose a diet"),
    mobility: enumOf(MOBILITY_LABELS, "Choose a mobility level"),
    unit_id: uuid("Choose a unit"),
    room_id: uuid("Choose a room on the unit").optional(),
  })
  .check((ctx) => {
    const value = ctx.value;
    if (value.admission_date < value.date_of_birth) {
      ctx.issues.push({
        code: "custom",
        path: ["admission_date"],
        message: "The admission date cannot be before the date of birth",
        input: value.admission_date,
      });
    }
    if (value.status !== "former") return;
    if (!value.stay_ended_on) {
      ctx.issues.push({
        code: "custom",
        path: ["stay_ended_on"],
        message: "Enter the date the stay ended",
        input: value.stay_ended_on,
      });
    } else if (value.stay_ended_on < value.admission_date) {
      ctx.issues.push({
        code: "custom",
        path: ["stay_ended_on"],
        message: "The stay cannot end before it began",
        input: value.stay_ended_on,
      });
    } else if (value.stay_ended_on > dateInZone(new Date())) {
      ctx.issues.push({
        code: "custom",
        path: ["stay_ended_on"],
        message: "The date the stay ended cannot be in the future",
        input: value.stay_ended_on,
      });
    }
    if (!value.stay_end_reason) {
      ctx.issues.push({
        code: "custom",
        path: ["stay_end_reason"],
        message: "Choose how the stay ended",
        input: value.stay_end_reason,
      });
    }
  })
  // A former resident holds no room; a current resident has no stay end.
  .transform((value): ResidentDetailsInput => {
    const former = value.status === "former";
    return {
      ...value,
      room_id: former ? null : (value.room_id ?? null),
      stay_ended_on: former ? (value.stay_ended_on ?? null) : null,
      stay_end_reason: former ? (value.stay_end_reason ?? null) : null,
    };
  });

// ---------------------------------------------------------------------------------------------
// Clinical records
// ---------------------------------------------------------------------------------------------

export const vitalsSchema = z
  .object({
    taken_at: pastInstant("time the readings were taken"),
    systolic: wholeNumber("the systolic pressure", 50, 260),
    diastolic: wholeNumber("the diastolic pressure", 30, 160),
    pulse: wholeNumber("the pulse", 25, 220),
    temperature_f: decimalNumber("the temperature in °F", 90, 108),
    respiratory_rate: wholeNumber("the respiratory rate", 4, 60),
    oxygen_saturation: wholeNumber("the oxygen saturation", 50, 100),
    weight_lb: decimalNumber("the weight in pounds", 50, 500).optional(),
    notes: text("notes", 500).optional(),
  })
  .refine((value) => value.systolic > value.diastolic, {
    path: ["diastolic"],
    error: "The diastolic pressure must be lower than the systolic pressure",
  });

export type VitalsInput = z.output<typeof vitalsSchema>;

export const medicationOrderSchema = z.object({
  medication: text("a medication", 200),
  frequency: enumOf(MEDICATION_FREQUENCY_LABELS, "Choose how often it is given"),
  instructions: text("instructions", 300).optional(),
  condition_id: uuid("Choose a condition on the resident's record").optional(),
  prescribed_by: uuid("Choose the prescribing physician"),
  started_on: notFutureDate("start date"),
});

export type MedicationOrderInput = z.output<typeof medicationOrderSchema>;

export const administrationSchema = z.object({
  medication_order_id: uuid("Choose a medication order"),
  status: enumOf(ADMINISTRATION_STATUS_LABELS, "Choose what happened"),
  notes: text("notes", 300).optional(),
});

export type AdministrationInput = z.output<typeof administrationSchema>;

export const progressNoteSchema = z.object({
  written_at: pastInstant("time the note was written"),
  body: text("the note", 4000),
});

export type ProgressNoteInput = z.output<typeof progressNoteSchema>;

export const incidentSchema = z.object({
  kind: enumOf(INCIDENT_KIND_LABELS, "Choose the kind of incident"),
  occurred_at: pastInstant("time it occurred"),
  description: text("a description of what happened", 4000),
  injury_sustained: checkbox,
});

export type IncidentInput = z.output<typeof incidentSchema>;

export const appointmentSchema = z.object({
  kind: enumOf(APPOINTMENT_KIND_LABELS, "Choose the kind of appointment"),
  scheduled_at: futureInstant("scheduled time"),
  location: text("where the appointment is", 120),
  purpose: text("what the appointment is for", 300),
});

export type AppointmentInput = z.output<typeof appointmentSchema>;

export const familyContactSchema = z.object({
  first_name: text("the first name", 60),
  last_name: text("the last name", 60),
  relationship: enumOf(FAMILY_RELATIONSHIP_LABELS, "Choose the relationship"),
  phone: z
    .string({ error: "Enter a phone number" })
    .regex(/^\+?[\d\s().-]{7,20}$/, { error: "Enter a phone number such as (617) 555-0142" }),
  email: z.email({ error: "Enter a valid email address" }).optional(),
  is_primary: checkbox,
  notes: text("notes", 300).optional(),
});

export type FamilyContactInput = z.output<typeof familyContactSchema>;

export const allergySchema = z.object({
  code: z.string({ error: "Choose an allergen" }),
  allergy_type: enumOf(ALLERGY_TYPE_LABELS, "Choose allergy or intolerance"),
  reaction: text("the reaction", 120).optional(),
  severity: enumOf(ALLERGY_SEVERITY_LABELS, "Choose a severity").optional(),
  noted_on: notFutureDate("date noted"),
});

export type AllergyInput = z.output<typeof allergySchema>;

/** Actions on one existing record: discontinue, cancel, archive. */
export const recordIdSchema = z.object({
  id: uuid("Choose a record"),
});

export const residentIdSchema = z.uuid({ error: "Choose a resident" });
