import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  allergySchema,
  appointmentSchema,
  familyContactSchema,
  formValues,
  incidentSchema,
  medicationOrderSchema,
  parseForm,
  progressNoteSchema,
  residentDetailsSchema,
  vitalsSchema,
} from "./schemas";

/** 2 pm Eastern on September 10, 2026. */
const NOW = new Date("2026-09-10T18:00:00Z");

function form(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.append(key, value);
  return formData;
}

function errorsOf<S extends Parameters<typeof parseForm>[0]>(
  schema: S,
  values: Record<string, string>,
) {
  const parsed = parseForm(schema, form(values));
  if (parsed.success) throw new Error("Expected the form to be invalid");
  return parsed.fieldErrors;
}

function dataOf<S extends Parameters<typeof parseForm>[0]>(
  schema: S,
  values: Record<string, string>,
) {
  const parsed = parseForm(schema, form(values));
  if (!parsed.success) {
    throw new Error(`Expected the form to be valid: ${JSON.stringify(parsed.fieldErrors)}`);
  }
  return parsed.data;
}

const VALID_VITALS = {
  taken_at: "2026-09-10T13:30",
  systolic: "128",
  diastolic: "76",
  pulse: "72",
  temperature_f: "98.24",
  respiratory_rate: "16",
  oxygen_saturation: "97",
};

const VALID_DETAILS = {
  first_name: "Rose",
  last_name: "Doe",
  date_of_birth: "1939-04-12",
  sex: "female",
  admission_date: "2025-11-03",
  status: "current",
  code_status: "full_code",
  diet: "cardiac",
  mobility: "walker",
  unit_id: "9b2d3a1e-1111-4c5d-9e8f-000000000001",
  room_id: "9b2d3a1e-2222-4c5d-9e8f-000000000002",
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formValues", () => {
  it("trims fields, drops empty ones, and ignores the framework's own fields", () => {
    const values = formValues(
      form({ body: "  Slept well.  ", notes: "   ", $ACTION_ID_abc: "x", weight_lb: "" }),
    );
    expect(values).toEqual({ body: "Slept well.", notes: undefined, weight_lb: undefined });
    expect("$ACTION_ID_abc" in values).toBe(false);
  });
});

describe("vitals", () => {
  it("reads the time as Eastern wall-clock and rounds decimals to one place", () => {
    const data = dataOf(vitalsSchema, { ...VALID_VITALS, weight_lb: "154.26" });
    expect(data.taken_at).toBe("2026-09-10T17:30:00.000Z");
    expect(data.temperature_f).toBe(98.2);
    expect(data.weight_lb).toBe(154.3);
    expect(data.notes).toBeUndefined();
  });

  it("explains each reading's range next to its field", () => {
    const errors = errorsOf(vitalsSchema, {
      ...VALID_VITALS,
      systolic: "abc",
      oxygen_saturation: "101",
      pulse: "72.5",
    });
    expect(errors.systolic).toEqual([
      "Enter the systolic pressure as a whole number from 50 to 260",
    ]);
    expect(errors.oxygen_saturation).toEqual([
      "Enter the oxygen saturation as a whole number from 50 to 100",
    ]);
    expect(errors.pulse).toEqual(["Enter the pulse as a whole number from 25 to 220"]);
    expect(errors.diastolic).toBeUndefined();
  });

  it("requires the diastolic pressure to be below the systolic", () => {
    const errors = errorsOf(vitalsSchema, { ...VALID_VITALS, systolic: "80", diastolic: "90" });
    expect(errors.diastolic).toEqual([
      "The diastolic pressure must be lower than the systolic pressure",
    ]);
  });

  it("rejects readings taken in the future, allowing a few minutes of clock skew", () => {
    expect(dataOf(vitalsSchema, { ...VALID_VITALS, taken_at: "2026-09-10T14:03" }).taken_at).toBe(
      "2026-09-10T18:03:00.000Z",
    );
    expect(
      errorsOf(vitalsSchema, { ...VALID_VITALS, taken_at: "2026-09-10T14:30" }).taken_at,
    ).toEqual(["The time the readings were taken cannot be in the future"]);
  });

  it("rejects a time on a date that does not exist", () => {
    expect(
      errorsOf(vitalsSchema, { ...VALID_VITALS, taken_at: "2026-02-31T10:00" }).taken_at,
    ).toEqual(["Enter a real date for the time the readings were taken"]);
    expect(errorsOf(vitalsSchema, { ...VALID_VITALS, taken_at: "yesterday" }).taken_at).toEqual([
      "Enter the time the readings were taken",
    ]);
  });

  it("names every missing reading", () => {
    const errors = errorsOf(vitalsSchema, {});
    expect(Object.keys(errors).sort()).toEqual([
      "diastolic",
      "oxygen_saturation",
      "pulse",
      "respiratory_rate",
      "systolic",
      "taken_at",
      "temperature_f",
    ]);
  });
});

describe("resident details", () => {
  it("keeps a current resident's room and clears any stay end", () => {
    const data = dataOf(residentDetailsSchema, {
      ...VALID_DETAILS,
      stay_ended_on: "2026-09-01",
      stay_end_reason: "discharged",
    });
    expect(data.room_id).toBe(VALID_DETAILS.room_id);
    expect(data.stay_ended_on).toBeNull();
    expect(data.stay_end_reason).toBeNull();
  });

  it("frees the room when a stay ends and requires how and when", () => {
    const data = dataOf(residentDetailsSchema, {
      ...VALID_DETAILS,
      status: "former",
      stay_ended_on: "2026-09-09",
      stay_end_reason: "transferred",
    });
    expect(data.room_id).toBeNull();
    expect(data.stay_ended_on).toBe("2026-09-09");

    const errors = errorsOf(residentDetailsSchema, { ...VALID_DETAILS, status: "former" });
    expect(errors.stay_ended_on).toEqual(["Enter the date the stay ended"]);
    expect(errors.stay_end_reason).toEqual(["Choose how the stay ended"]);
  });

  it("keeps the stay's dates in order", () => {
    expect(
      errorsOf(residentDetailsSchema, {
        ...VALID_DETAILS,
        status: "former",
        stay_ended_on: "2025-01-01",
        stay_end_reason: "discharged",
      }).stay_ended_on,
    ).toEqual(["The stay cannot end before it began"]);
    expect(
      errorsOf(residentDetailsSchema, {
        ...VALID_DETAILS,
        status: "former",
        stay_ended_on: "2026-09-11",
        stay_end_reason: "discharged",
      }).stay_ended_on,
    ).toEqual(["The date the stay ended cannot be in the future"]);
    expect(
      errorsOf(residentDetailsSchema, { ...VALID_DETAILS, admission_date: "1930-01-01" })
        .admission_date,
    ).toEqual(["The admission date cannot be before the date of birth"]);
    expect(
      errorsOf(residentDetailsSchema, { ...VALID_DETAILS, date_of_birth: "2026-09-10" })
        .date_of_birth,
    ).toEqual(["Enter a date of birth in the past"]);
  });

  it("allows a resident without a room", () => {
    expect(dataOf(residentDetailsSchema, { ...VALID_DETAILS, room_id: "" }).room_id).toBeNull();
  });
});

describe("appointments", () => {
  it("must be scheduled in the future", () => {
    const valid = {
      kind: "dialysis",
      scheduled_at: "2026-09-11T09:00",
      location: "Bay State Dialysis",
      purpose: "Routine session",
    };
    expect(dataOf(appointmentSchema, valid).scheduled_at).toBe("2026-09-11T13:00:00.000Z");
    expect(
      errorsOf(appointmentSchema, { ...valid, scheduled_at: "2026-09-10T13:00" }).scheduled_at,
    ).toEqual(["The scheduled time must be in the future"]);
    expect(errorsOf(appointmentSchema, { ...valid, kind: "spa" }).kind).toEqual([
      "Choose the kind of appointment",
    ]);
  });
});

describe("incidents and notes", () => {
  it("reads the injury checkbox and rejects future times", () => {
    const valid = {
      kind: "fall",
      occurred_at: "2026-09-10T06:15",
      description: "Found on the floor beside the bed.",
    };
    expect(dataOf(incidentSchema, valid).injury_sustained).toBe(false);
    expect(dataOf(incidentSchema, { ...valid, injury_sustained: "on" }).injury_sustained).toBe(
      true,
    );
    expect(
      errorsOf(incidentSchema, { ...valid, occurred_at: "2026-09-10T15:00" }).occurred_at,
    ).toEqual(["The time it occurred cannot be in the future"]);
    expect(errorsOf(progressNoteSchema, { written_at: "2026-09-10T13:00" }).body).toEqual([
      "Enter the note",
    ]);
  });
});

describe("medication orders, family contacts, and allergies", () => {
  it("asks for a medication, a frequency, a prescriber, and a start date", () => {
    const errors = errorsOf(medicationOrderSchema, { started_on: "2026-09-11" });
    expect(errors.medication).toEqual(["Enter a medication"]);
    expect(errors.frequency).toEqual(["Choose how often it is given"]);
    expect(errors.prescribed_by).toEqual(["Choose the prescribing physician"]);
    expect(errors.started_on).toEqual(["The start date cannot be in the future"]);
  });

  it("checks phone numbers and email addresses", () => {
    const valid = {
      first_name: "Ana",
      last_name: "Doe",
      relationship: "daughter",
      phone: "(617) 555-0142",
    };
    const data = dataOf(familyContactSchema, { ...valid, is_primary: "on" });
    expect(data.is_primary).toBe(true);
    expect(data.email).toBeUndefined();
    expect(errorsOf(familyContactSchema, { ...valid, phone: "call me" }).phone).toEqual([
      "Enter a phone number such as (617) 555-0142",
    ]);
    expect(errorsOf(familyContactSchema, { ...valid, email: "ana@" }).email).toEqual([
      "Enter a valid email address",
    ]);
  });

  it("makes reaction and severity optional and the date noted not in the future", () => {
    const data = dataOf(allergySchema, {
      code: "7984",
      allergy_type: "allergy",
      noted_on: "2026-09-10",
    });
    expect(data.reaction).toBeUndefined();
    expect(data.severity).toBeUndefined();
    expect(
      errorsOf(allergySchema, { code: "7984", allergy_type: "allergy", noted_on: "2026-09-11" })
        .noted_on,
    ).toEqual(["The date noted cannot be in the future"]);
  });
});
