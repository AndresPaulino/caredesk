import { describe, expect, it } from "vitest";

import { NO_REFERENCES, type AuditReferences } from "./columns";
import { describeAuditEvent, medicationShortName, type AuditEvent } from "./describe";

const references: AuditReferences = {
  rooms: new Map([["room-214", "214"]]),
  units: new Map([["unit-b", "Unit B"]]),
  staff: new Map([["dr-chen", "Wei Chen, MD"]]),
  medicationOrders: new Map([["order-metformin", "Metformin 500 MG Oral Tablet"]]),
};

const actor = { id: "nurse", first_name: "Maria", last_name: "Alvarez", credentials: "RN" };

function event(
  partial: Partial<AuditEvent> & Pick<AuditEvent, "table_name" | "operation">,
): AuditEvent {
  return {
    id: "event",
    occurred_at: "2026-09-10T15:00:00.000Z",
    record_id: "record",
    resident_id: "resident",
    old_values: null,
    new_values: null,
    changed_columns: [],
    actor,
    ...partial,
  };
}

const vitalsRow = {
  id: "record",
  resident_id: "resident",
  taken_at: "2026-09-10T11:31:00+00:00",
  taken_by: "nurse",
  systolic: 132,
  diastolic: 78,
  pulse: 74,
  temperature_f: 98.4,
  respiratory_rate: 16,
  oxygen_saturation: 96,
  weight_lb: null,
  notes: null,
  created_at: "2026-09-10T11:31:05+00:00",
  updated_at: "2026-09-10T11:31:05+00:00",
  archived_at: null,
};

describe("describing an audit event", () => {
  it("reads an addition as what was recorded, with every value it holds", () => {
    const story = describeAuditEvent(
      event({ table_name: "vitals", operation: "insert", new_values: vitalsRow }),
      { ...NO_REFERENCES, staff: new Map([["nurse", "Maria Alvarez, RN"]]) },
    );
    expect(story).toMatchObject({
      summary: "recorded vitals",
      kind: "added",
      recordLabel: "Vitals",
      tab: "vitals",
    });
    expect(story.changes.map((change) => [change.label, change.after])).toEqual([
      ["Taken at", "Sep 10, 2026, 7:31 AM"],
      ["Taken by", "Maria Alvarez, RN"],
      ["Systolic (mm Hg)", "132"],
      ["Diastolic (mm Hg)", "78"],
      ["Pulse (bpm)", "74"],
      ["Temperature (°F)", "98.4"],
      ["Respiratory rate (per min)", "16"],
      ["Oxygen saturation (%)", "96"],
    ]);
    expect(story.changes.every((change) => change.before === null)).toBe(true);
  });

  it("reads an update as what changed, before and after, in display terms", () => {
    const before = { id: "resident", diet: "regular", mobility: "walker", updated_at: "a" };
    const story = describeAuditEvent(
      event({
        table_name: "residents",
        operation: "update",
        old_values: before,
        new_values: { ...before, diet: "diabetic", updated_at: "b" },
        changed_columns: ["diet"],
      }),
      NO_REFERENCES,
    );
    expect(story.summary).toBe("changed the resident's diet from Regular to Diabetic");
    expect(story.kind).toBe("changed");
    expect(story.tab).toBeNull();
    expect(story.changes).toEqual([
      { column: "diet", label: "Diet", before: "Regular", after: "Diabetic" },
    ]);
  });

  it("names the room and unit a resident moved to", () => {
    const before = { id: "resident", unit_id: "unit-a", room_id: "room-101", status: "current" };
    const moved = describeAuditEvent(
      event({
        table_name: "residents",
        operation: "update",
        old_values: before,
        new_values: { ...before, unit_id: "unit-b", room_id: "room-214" },
        changed_columns: ["room_id", "unit_id"],
      }),
      references,
    );
    expect(moved.summary).toBe("moved the resident to Room 214, Unit B");
    expect(moved.changes).toEqual([
      { column: "unit_id", label: "Unit", before: "Outside your scope", after: "Unit B" },
      { column: "room_id", label: "Room", before: "Outside your scope", after: "214" },
    ]);
  });

  it("reads the end of a stay by its reason, and a readmission", () => {
    const current = { id: "resident", status: "current", stay_end_reason: null, room_id: "r" };
    const former = { ...current, status: "former", stay_end_reason: "deceased", room_id: null };
    const ended = describeAuditEvent(
      event({
        table_name: "residents",
        operation: "update",
        old_values: current,
        new_values: former,
        changed_columns: ["room_id", "stay_end_reason", "status"],
      }),
      NO_REFERENCES,
    );
    expect(ended.summary).toBe("recorded the resident's death");
    const readmitted = describeAuditEvent(
      event({
        table_name: "residents",
        operation: "update",
        old_values: former,
        new_values: current,
        changed_columns: ["room_id", "stay_end_reason", "status"],
      }),
      NO_REFERENCES,
    );
    expect(readmitted.summary).toBe("readmitted the resident");
  });

  it("reads an archive as a removal, never a deletion", () => {
    const allergy = {
      id: "record",
      description: "Penicillin V",
      allergy_type: "allergy",
      archived_at: null,
    };
    const archived = describeAuditEvent(
      event({
        table_name: "allergies",
        operation: "update",
        old_values: allergy,
        new_values: { ...allergy, archived_at: "2026-09-10T15:12:00+00:00" },
        changed_columns: ["archived_at"],
      }),
      NO_REFERENCES,
    );
    expect(archived).toMatchObject({
      summary: "removed the Penicillin V allergy",
      kind: "removed",
      recordLabel: "Allergy",
      tab: "allergies",
    });
    expect(archived.changes).toEqual([
      { column: "archived_at", label: "Removed on", before: null, after: "Sep 10, 2026, 11:12 AM" },
    ]);

    const deleted = describeAuditEvent(
      event({ table_name: "allergies", operation: "delete", old_values: allergy }),
      NO_REFERENCES,
    );
    expect(deleted.summary).toBe("deleted the Penicillin V allergy");
    expect(deleted.kind).toBe("removed");
    expect(deleted.changes).toEqual([
      { column: "description", label: "Allergen", before: "Penicillin V", after: null },
      { column: "allergy_type", label: "Type", before: "Allergy", after: null },
    ]);
  });

  it("names the medication behind an order or an administration", () => {
    const order = {
      id: "record",
      medication: "Metformin 500 MG Oral Tablet",
      status: "active",
      ended_on: null,
      prescribed_by: "dr-chen",
    };
    expect(
      describeAuditEvent(
        event({ table_name: "medication_orders", operation: "insert", new_values: order }),
        references,
      ),
    ).toMatchObject({
      summary: "added an order for Metformin 500 MG Oral Tablet",
      tab: "medications",
    });
    const discontinued = describeAuditEvent(
      event({
        table_name: "medication_orders",
        operation: "update",
        old_values: order,
        new_values: { ...order, status: "discontinued", ended_on: "2026-09-10" },
        changed_columns: ["ended_on", "status"],
      }),
      references,
    );
    expect(discontinued.summary).toBe("discontinued the Metformin order");
    expect(discontinued.changes).toEqual([
      { column: "ended_on", label: "Ended", before: null, after: "Sep 10, 2026" },
      { column: "status", label: "Status", before: "Active", after: "Discontinued" },
    ]);

    const dose = (status: string) =>
      describeAuditEvent(
        event({
          table_name: "administrations",
          operation: "insert",
          new_values: { id: "record", medication_order_id: "order-metformin", status },
        }),
        references,
      ).summary;
    expect(dose("given")).toBe("gave Metformin");
    expect(dose("refused")).toBe("recorded Metformin as refused");
    expect(dose("held")).toBe("held Metformin");
    expect(
      describeAuditEvent(
        event({
          table_name: "administrations",
          operation: "insert",
          new_values: { id: "record", medication_order_id: "unknown", status: "given" },
        }),
        NO_REFERENCES,
      ).summary,
    ).toBe("gave a medication");
  });

  it("reads the other record types in the glossary's words", () => {
    const summary = (
      table: string,
      operation: AuditEvent["operation"],
      oldValues: Record<string, unknown> | null,
      newValues: Record<string, unknown> | null,
      changed: string[] = [],
    ) =>
      describeAuditEvent(
        event({
          table_name: table,
          operation,
          old_values: oldValues,
          new_values: newValues,
          changed_columns: changed,
        }),
        references,
      ).summary;

    expect(summary("progress_notes", "insert", null, { body: "Resting." })).toBe(
      "wrote a progress note",
    );
    expect(summary("incidents", "insert", null, { kind: "fall", injury_sustained: true })).toBe(
      "reported a fall with injury",
    );
    expect(summary("incidents", "insert", null, { kind: "medication_error" })).toBe(
      "reported a medication error",
    );
    expect(summary("appointments", "insert", null, { kind: "specialist" })).toBe(
      "scheduled a specialist appointment",
    );
    expect(summary("appointments", "insert", null, { kind: "other" })).toBe(
      "scheduled an appointment",
    );
    expect(
      summary(
        "appointments",
        "update",
        { kind: "dialysis", status: "scheduled" },
        { kind: "dialysis", status: "cancelled" },
        ["status"],
      ),
    ).toBe("cancelled the dialysis appointment");
    expect(
      summary("family_contacts", "insert", null, {
        first_name: "Jane",
        last_name: "Doe",
        relationship: "daughter",
      }),
    ).toBe("added Jane Doe (daughter) as a family contact");
    expect(
      summary(
        "family_contacts",
        "update",
        { first_name: "Jane", last_name: "Doe", is_primary: false },
        { first_name: "Jane", last_name: "Doe", is_primary: true },
        ["is_primary"],
      ),
    ).toBe("made Jane Doe the primary contact");
    expect(
      summary(
        "family_contacts",
        "update",
        { first_name: "Jane", last_name: "Doe", phone: "1" },
        { first_name: "Jane", last_name: "Doe", phone: "2" },
        ["phone"],
      ),
    ).toBe("updated Jane Doe's contact details");
    expect(
      summary(
        "family_contacts",
        "update",
        { first_name: "Jane", last_name: "Doe", archived_at: null },
        { first_name: "Jane", last_name: "Doe", archived_at: "2026-09-10T15:00:00Z" },
        ["archived_at"],
      ),
    ).toBe("removed Jane Doe from the family contacts");
    expect(summary("assessments", "insert", null, { kind: "podiatry" })).toBe(
      "recorded a podiatry assessment",
    );
    expect(summary("assessments", "insert", null, { kind: "physician_visit" })).toBe(
      "recorded a physician visit",
    );
    expect(
      summary("lab_results", "insert", null, {
        description: "Hemoglobin A1c",
        value: 7.2,
        units: "%",
      }),
    ).toBe("recorded a lab result: Hemoglobin A1c 7.2 %");
    expect(
      summary(
        "conditions",
        "update",
        { description: "Gout", resolved_on: null },
        {
          description: "Gout",
          resolved_on: "2026-09-01",
        },
        ["resolved_on"],
      ),
    ).toBe("marked Gout resolved");
    expect(summary("residents", "insert", null, { first_name: "A" })).toBe("admitted the resident");
  });

  it("lists a few changed fields, and says 'details' for many", () => {
    const before = {
      id: "resident",
      diet: "regular",
      mobility: "walker",
      code_status: "full_code",
      first_name: "A",
    };
    const two = describeAuditEvent(
      event({
        table_name: "residents",
        operation: "update",
        old_values: before,
        new_values: { ...before, diet: "renal", mobility: "cane" },
        changed_columns: ["diet", "mobility"],
      }),
      NO_REFERENCES,
    );
    expect(two.summary).toBe("updated the resident's diet and mobility");
    const many = describeAuditEvent(
      event({
        table_name: "residents",
        operation: "update",
        old_values: before,
        new_values: {
          ...before,
          diet: "renal",
          mobility: "cane",
          code_status: "dnr",
          first_name: "B",
        },
        changed_columns: ["code_status", "diet", "first_name", "mobility"],
      }),
      NO_REFERENCES,
    );
    expect(many.summary).toBe("updated the resident's details");
    expect(many.changes.map((change) => change.label)).toEqual([
      "First name",
      "Code status",
      "Diet",
      "Mobility",
    ]);
  });

  it("hides bookkeeping columns and shows unknown ones under a plain name", () => {
    const story = describeAuditEvent(
      event({
        table_name: "progress_notes",
        operation: "insert",
        new_values: {
          id: "record",
          resident_id: "resident",
          created_at: "x",
          updated_at: "x",
          archived_at: null,
          body: "Resting comfortably.",
          written_at: "2026-09-10T11:31:00+00:00",
          written_by: "nobody",
          mood_score: 4,
        },
      }),
      NO_REFERENCES,
    );
    expect(story.changes.map((change) => [change.label, change.after])).toEqual([
      ["Written at", "Sep 10, 2026, 7:31 AM"],
      ["Written by", "Outside your scope"],
      ["Note", "Resting comfortably."],
      ["Mood score", "4"],
    ]);
  });

  it("falls back to a plain sentence for a table it does not know", () => {
    const story = describeAuditEvent(
      event({ table_name: "units", operation: "update", old_values: {}, new_values: {} }),
      NO_REFERENCES,
    );
    expect(story).toMatchObject({
      summary: "updated a units record",
      recordLabel: "Units",
      tab: null,
    });
  });

  it("shortens a medication name to the part before its strength", () => {
    expect(medicationShortName("Metformin 500 MG Oral Tablet")).toBe("Metformin");
    expect(medicationShortName("Acetaminophen 325 MG / Oxycodone 5 MG Oral Tablet")).toBe(
      "Acetaminophen",
    );
    expect(medicationShortName("Insulin Glargine")).toBe("Insulin Glargine");
    expect(medicationShortName("")).toBe("");
  });
});
