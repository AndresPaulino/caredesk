import {
  ADMINISTRATION_STATUS_LABELS,
  APPOINTMENT_KIND_LABELS,
  CARE_PLAN_GOAL_STATUS_LABELS,
  INCIDENT_KIND_LABELS,
} from "../clinical/labels";
import { formatShortDateTime, type StaffName } from "../format";
import type { RecordTabKey } from "../residents/record-tabs";
import type { Enums } from "../supabase/database.types";

import {
  assessmentKindName,
  columnLabel,
  formatColumnValue,
  isAuditedTable,
  visibleColumns,
  type AuditReferences,
  type AuditedTable,
} from "./columns";

/**
 * The audit trail as a story. An audit event is a row of the audit_events table: a table
 * name, an operation, and the row before and after. This module turns one into a sentence a
 * nurse would say ("discontinued the Metformin order", "moved the resident to Room 214") and
 * a field-by-field list of what changed, using the glossary's names for records and the
 * display conventions of the rest of the resident page.
 *
 * Removals are updates that stamp archived_at (records are archived, never deleted), so they
 * read as "removed"; a hard delete, which only the service role can do, reads as "deleted".
 */

export type AuditOperation = Enums<"audit_operation">;

/** A row's columns as stored in the event, straight from JSON. */
export type AuditValues = Record<string, unknown>;

export type AuditActor = (StaffName & { id: string }) | null;

export type AuditEvent = {
  id: string;
  occurred_at: string;
  table_name: string;
  record_id: string;
  resident_id: string;
  operation: AuditOperation;
  old_values: AuditValues | null;
  new_values: AuditValues | null;
  changed_columns: string[];
  /** The staff member who made the change, or null when outside the reader's scope. */
  actor: AuditActor;
};

export type AuditChange = {
  column: string;
  label: string;
  before: string | null;
  after: string | null;
};

/** What happened to the record, for an icon and a tone. */
export type AuditStoryKind = "added" | "changed" | "removed";

export type AuditStory = {
  /** The predicate after the actor's name: "recorded vitals". */
  summary: string;
  kind: AuditStoryKind;
  /** The record type in the glossary's words: "Medication order". */
  recordLabel: string;
  /** The record tab holding the record, or null for records without one. */
  tab: RecordTabKey | null;
  /** The fields to show: every recorded value for an addition or removal, only what changed otherwise. */
  changes: AuditChange[];
};

export type AuditTrailEntry = AuditEvent & { story: AuditStory };

export const RECORD_LABELS: Readonly<Record<AuditedTable, string>> = {
  residents: "Resident",
  conditions: "Condition",
  allergies: "Allergy",
  medication_orders: "Medication order",
  administrations: "Administration",
  vitals: "Vitals",
  assessments: "Assessment",
  lab_results: "Lab result",
  care_plans: "Care plan",
  care_plan_goals: "Care plan goal",
  incidents: "Incident",
  progress_notes: "Progress note",
  appointments: "Appointment",
  family_contacts: "Family contact",
};

const RECORD_TABS: Readonly<Record<AuditedTable, RecordTabKey | null>> = {
  residents: null,
  conditions: "conditions",
  allergies: "allergies",
  medication_orders: "medications",
  administrations: "medications",
  vitals: "vitals",
  assessments: null,
  lab_results: "labs",
  care_plans: "care-plan",
  care_plan_goals: "care-plan",
  incidents: "incidents",
  progress_notes: "notes",
  appointments: "appointments",
  family_contacts: "family",
};

export function describeAuditEvent(event: AuditEvent, references: AuditReferences): AuditStory {
  const table = event.table_name;
  if (!isAuditedTable(table)) {
    return {
      summary: `${verbFor(event.operation)} a ${table.replace(/_/g, " ")} record`,
      kind:
        event.operation === "insert"
          ? "added"
          : event.operation === "delete"
            ? "removed"
            : "changed",
      recordLabel: humanizeTable(table),
      tab: null,
      changes: [],
    };
  }

  const before = event.old_values ?? {};
  const after = event.new_values ?? {};
  const row = event.new_values ?? before;
  const changed = new Set(event.changed_columns);
  const context: Context = { table, before, after, row, changed, references };

  const { summary, kind } = summarize(event.operation, context);
  return {
    summary,
    kind,
    recordLabel: RECORD_LABELS[table],
    tab: RECORD_TABS[table],
    changes: changesFor(event.operation, context),
  };
}

type Context = {
  table: AuditedTable;
  before: AuditValues;
  after: AuditValues;
  /** The row as it is now, or as it was for a deletion. */
  row: AuditValues;
  changed: Set<string>;
  references: AuditReferences;
};

// ---------------------------------------------------------------------------------------------
// The sentence
// ---------------------------------------------------------------------------------------------

function summarize(
  operation: AuditOperation,
  context: Context,
): { summary: string; kind: AuditStoryKind } {
  if (operation === "insert") return { summary: added(context), kind: "added" };
  if (operation === "delete") return { summary: `deleted ${subject(context)}`, kind: "removed" };
  if (context.changed.has("archived_at") && context.after.archived_at != null) {
    return { summary: removed(context), kind: "removed" };
  }
  return { summary: updated(context), kind: "changed" };
}

function added({ table, row, references }: Context): string {
  switch (table) {
    case "residents":
      return "admitted the resident";
    case "conditions":
      return `added the condition ${str(row.description)}`;
    case "allergies":
      return `added an ${row.allergy_type === "intolerance" ? "intolerance" : "allergy"} to ${str(row.description)}`;
    case "medication_orders":
      return `added an order for ${str(row.medication)}`;
    case "administrations": {
      const medication = medicationOf(row, references);
      switch (row.status) {
        case "refused":
          return `recorded ${medication} as refused`;
        case "held":
          return `held ${medication}`;
        default:
          return `gave ${medication}`;
      }
    }
    case "vitals":
      return "recorded vitals";
    case "assessments":
      return `recorded ${withArticle(assessmentNoun(row.kind))}`;
    case "lab_results":
      return `recorded a lab result: ${str(row.description)} ${str(row.value)} ${str(row.units)}`.trimEnd();
    case "care_plans":
      return `started a care plan: ${str(row.description)}`;
    case "care_plan_goals":
      return `added a care plan goal: ${str(row.description)}`;
    case "incidents":
      return `reported ${withArticle(incidentNoun(row.kind))}${row.injury_sustained ? " with injury" : ""}`;
    case "progress_notes":
      return "wrote a progress note";
    case "appointments":
      return `scheduled ${withArticle(appointmentNoun(row.kind))}`;
    case "family_contacts":
      return `added ${personName(row)} (${relationshipOf(row)}) as a family contact`;
  }
}

function removed(context: Context): string {
  if (context.table === "family_contacts") {
    return `removed ${personName(context.row)} from the family contacts`;
  }
  return `removed ${subject(context)}`;
}

function updated(context: Context): string {
  const { table, before, after, row, changed, references } = context;
  switch (table) {
    case "residents": {
      if (changed.has("status")) {
        if (after.status === "former") {
          switch (after.stay_end_reason) {
            case "transferred":
              return "transferred the resident";
            case "deceased":
              return "recorded the resident's death";
            default:
              return "discharged the resident";
          }
        }
        return "readmitted the resident";
      }
      if (changed.has("room_id") || changed.has("unit_id")) {
        const room = after.room_id == null ? null : references.rooms.get(String(after.room_id));
        const unit = references.units.get(String(after.unit_id));
        if (room && unit) return `moved the resident to Room ${room}, ${unit}`;
        if (room) return `moved the resident to Room ${room}`;
        if (after.room_id == null) return "moved the resident out of their room";
        if (unit) return `moved the resident to ${unit}`;
        return "moved the resident";
      }
      return changedFields("the resident's", context);
    }
    case "medication_orders":
      if (changed.has("status")) {
        return after.status === "discontinued"
          ? `discontinued ${subject(context)}`
          : `restarted ${subject(context)}`;
      }
      return `updated ${subject(context)}`;
    case "administrations":
      if (changed.has("status")) {
        const status = labelFor(ADMINISTRATION_STATUS_LABELS, after.status);
        return `marked ${medicationOf(row, references)} as ${status.toLowerCase()}`;
      }
      return `updated ${subject(context)}`;
    case "appointments":
      if (changed.has("status")) {
        if (after.status === "cancelled") return `cancelled ${subject(context)}`;
        if (after.status === "completed") return `marked ${subject(context)} completed`;
      }
      if (changed.has("scheduled_at")) {
        return `rescheduled ${subject(context)} to ${formatShortDateTime(str(after.scheduled_at))}`;
      }
      return `updated ${subject(context)}`;
    case "family_contacts":
      if (changed.size === 1 && changed.has("is_primary")) {
        return after.is_primary
          ? `made ${personName(row)} the primary contact`
          : `removed ${personName(row)} as the primary contact`;
      }
      return `updated ${personName(row)}'s contact details`;
    case "conditions":
      if (changed.has("resolved_on") && after.resolved_on != null && before.resolved_on == null) {
        return `marked ${str(row.description)} resolved`;
      }
      return `updated ${subject(context)}`;
    case "care_plans":
      if (changed.has("status") && after.status === "completed") {
        return `completed ${subject(context)}`;
      }
      return `updated ${subject(context)}`;
    case "care_plan_goals":
      if (changed.has("status")) {
        const status = labelFor(CARE_PLAN_GOAL_STATUS_LABELS, after.status);
        return `marked a care plan goal ${status.toLowerCase()}`;
      }
      return `updated ${subject(context)}`;
    case "progress_notes":
      return `edited ${subject(context)}`;
    default:
      return `updated ${subject(context)}`;
  }
}

/** "changed the resident's diet from Regular to Diabetic", or a list of what changed. */
function changedFields(owner: string, context: Context): string {
  const { table, before, after, changed, references } = context;
  const columns = visibleColumns(table, changed);
  if (columns.length === 1) {
    const column = columns[0];
    const label = columnLabel(table, column).toLowerCase();
    const from = formatColumnValue(table, column, before[column], references);
    const to = formatColumnValue(table, column, after[column], references);
    if (from && to) return `changed ${owner} ${label} from ${from} to ${to}`;
    if (to) return `set ${owner} ${label} to ${to}`;
    if (from) return `cleared ${owner} ${label}`;
  }
  if (columns.length > 0 && columns.length <= 3) {
    return `updated ${owner} ${list(columns.map((column) => columnLabel(table, column).toLowerCase()))}`;
  }
  return `updated ${owner} details`;
}

/** The record as the object of a sentence: "the Metformin order", "the fall report". */
function subject({ table, row, references }: Context): string {
  switch (table) {
    case "residents":
      return "the resident";
    case "conditions":
      return `the condition ${str(row.description)}`;
    case "allergies":
      return `the ${str(row.description)} ${row.allergy_type === "intolerance" ? "intolerance" : "allergy"}`;
    case "medication_orders":
      return `the ${medicationShortName(str(row.medication))} order`;
    case "administrations":
      return `the ${medicationOf(row, references)} administration`;
    case "vitals":
      return `the vitals from ${formatShortDateTime(str(row.taken_at))}`;
    case "assessments":
      return `the ${assessmentNoun(row.kind)} from ${formatShortDateTime(str(row.performed_at))}`;
    case "lab_results":
      return `the ${str(row.description)} result`;
    case "care_plans":
      return `the care plan ${str(row.description)}`;
    case "care_plan_goals":
      return `the care plan goal ${str(row.description)}`;
    case "incidents":
      return `the ${incidentNoun(row.kind)} report`;
    case "progress_notes":
      return `the progress note from ${formatShortDateTime(str(row.written_at))}`;
    case "appointments":
      return `the ${appointmentNoun(row.kind)}`;
    case "family_contacts":
      return `${personName(row)}'s contact details`;
  }
}

// ---------------------------------------------------------------------------------------------
// The fields
// ---------------------------------------------------------------------------------------------

function changesFor(operation: AuditOperation, context: Context): AuditChange[] {
  const { table, before, after, changed, references } = context;
  const format = (values: AuditValues, column: string) =>
    formatColumnValue(table, column, values[column], references);

  if (operation === "update") {
    return visibleColumns(table, changed).map((column) => ({
      column,
      label: columnLabel(table, column),
      before: format(before, column),
      after: format(after, column),
    }));
  }

  const values = operation === "insert" ? after : before;
  return visibleColumns(table, Object.keys(values))
    .filter((column) => values[column] !== null && values[column] !== undefined)
    .map((column) => {
      const shown = format(values, column);
      return {
        column,
        label: columnLabel(table, column),
        before: operation === "delete" ? shown : null,
        after: operation === "insert" ? shown : null,
      };
    });
}

// ---------------------------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------------------------

/** "Metformin" from "Metformin 500 MG Oral Tablet": the name up to the strength. */
export function medicationShortName(medication: string): string {
  const name = medication.split(/\s+\d/)[0]?.trim();
  return name || medication;
}

function medicationOf(row: AuditValues, references: AuditReferences): string {
  const name = references.medicationOrders.get(String(row.medication_order_id));
  return name ? medicationShortName(name) : "a medication";
}

function assessmentNoun(kind: unknown): string {
  const name = assessmentKindName(kind).toLowerCase();
  return ["podiatry", "dental", "vision"].includes(name) ? `${name} assessment` : name;
}

function incidentNoun(kind: unknown): string {
  return labelFor(INCIDENT_KIND_LABELS, kind).toLowerCase();
}

function appointmentNoun(kind: unknown): string {
  if (kind === "other") return "appointment";
  return `${labelFor(APPOINTMENT_KIND_LABELS, kind).toLowerCase()} appointment`;
}

function labelFor(labels: Readonly<Record<string, string>>, value: unknown): string {
  return labels[str(value)] ?? str(value);
}

function personName(row: AuditValues): string {
  return `${str(row.first_name)} ${str(row.last_name)}`.trim() || "the contact";
}

function relationshipOf(row: AuditValues): string {
  const labels: Readonly<Record<string, string>> = {
    spouse: "spouse",
    daughter: "daughter",
    son: "son",
    sibling: "sibling",
    grandchild: "grandchild",
    niece_or_nephew: "niece or nephew",
    friend: "friend",
    guardian: "guardian",
    other: "other",
  };
  return labels[String(row.relationship)] ?? str(row.relationship);
}

function withArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function verbFor(operation: AuditOperation): string {
  return operation === "insert" ? "added" : operation === "delete" ? "deleted" : "updated";
}

function humanizeTable(table: string): string {
  const words = table.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}
