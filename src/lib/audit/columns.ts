import { ASSESSMENT_KIND_BY_KEY } from "../clinical/assessment-kinds";
import {
  ADMINISTRATION_STATUS_LABELS,
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  CARE_PLAN_GOAL_STATUS_LABELS,
  CARE_PLAN_STATUS_LABELS,
  FAMILY_RELATIONSHIP_LABELS,
  INCIDENT_KIND_LABELS,
  MEDICATION_ORDER_STATUS_LABELS,
} from "../clinical/labels";
import { MEDICATION_FREQUENCY_LABELS } from "../clinical/medication-schedule";
import { formatDate, formatShortDateTime } from "../format";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  RESIDENT_STATUS_LABELS,
  STAY_END_REASON_LABELS,
  sexLabel,
} from "../residents/labels";

/**
 * How each tracked table's columns read in the audit trail: the label a field is shown under,
 * and how its stored value is formatted (enumerations by their display label, dates and
 * times in the facilities' conventions, foreign keys by the name of what they point at).
 * Columns not listed here are shown under a humanized name with a plain value; bookkeeping
 * columns are hidden.
 */

export const AUDITED_TABLES = [
  "residents",
  "conditions",
  "allergies",
  "medication_orders",
  "administrations",
  "vitals",
  "assessments",
  "lab_results",
  "care_plans",
  "care_plan_goals",
  "incidents",
  "progress_notes",
  "appointments",
  "family_contacts",
] as const;

export type AuditedTable = (typeof AUDITED_TABLES)[number];

export function isAuditedTable(value: string): value is AuditedTable {
  return (AUDITED_TABLES as readonly string[]).includes(value);
}

/** What a foreign key can be resolved to: the id, and the name it is shown as. */
export type AuditReferenceKind = "rooms" | "units" | "staff" | "medicationOrders";

export type AuditReferences = Readonly<Record<AuditReferenceKind, ReadonlyMap<string, string>>>;

export const NO_REFERENCES: AuditReferences = {
  rooms: new Map(),
  units: new Map(),
  staff: new Map(),
  medicationOrders: new Map(),
};

/** Shown in place of a name the caller's scope does not include (a room on another unit). */
export const OUT_OF_SCOPE = "Outside your scope";

export type ColumnSpec = {
  label: string;
  format?: (value: unknown, references: AuditReferences) => string;
  /** The reference this column's id resolves through, when it is a foreign key. */
  reference?: AuditReferenceKind;
};

type ColumnSpecs = Readonly<Record<string, ColumnSpec>>;

const text = (label: string): ColumnSpec => ({ label });
const date = (label: string): ColumnSpec => ({ label, format: (v) => formatDate(String(v)) });
const time = (label: string): ColumnSpec => ({
  label,
  format: (v) => formatShortDateTime(String(v)),
});
const yesNo = (label: string): ColumnSpec => ({ label, format: (v) => (v ? "Yes" : "No") });
const enumeration = (label: string, labels: Readonly<Record<string, string>>): ColumnSpec => ({
  label,
  format: (v) => labels[String(v)] ?? String(v),
});
const reference = (label: string, kind: AuditReferenceKind): ColumnSpec => ({
  label,
  reference: kind,
  format: (v, references) => references[kind].get(String(v)) ?? OUT_OF_SCOPE,
});
const decimal = (label: string, digits: number): ColumnSpec => ({
  label,
  format: (v) => (typeof v === "number" ? v.toFixed(digits) : String(v)),
});

const removedOn = time("Removed on");

const STAFF_REFERENCE = (label: string) => reference(label, "staff");

export const COLUMN_SPECS: Readonly<Record<AuditedTable, ColumnSpecs>> = {
  residents: {
    first_name: text("First name"),
    last_name: text("Last name"),
    date_of_birth: date("Date of birth"),
    sex: { label: "Sex", format: (v) => sexLabel(String(v)) },
    admission_date: date("Admitted on"),
    status: enumeration("Status", RESIDENT_STATUS_LABELS),
    stay_ended_on: date("Stay ended on"),
    stay_end_reason: enumeration("Reason the stay ended", STAY_END_REASON_LABELS),
    code_status: enumeration("Code status", CODE_STATUS_LABELS),
    diet: enumeration("Diet", DIET_LABELS),
    mobility: enumeration("Mobility", MOBILITY_LABELS),
    unit_id: reference("Unit", "units"),
    room_id: reference("Room", "rooms"),
    archived_at: removedOn,
  },
  conditions: {
    description: text("Condition"),
    onset_date: date("Onset"),
    resolved_on: date("Resolved on"),
    archived_at: removedOn,
  },
  allergies: {
    description: text("Allergen"),
    category: enumeration("Category", ALLERGY_CATEGORY_LABELS),
    allergy_type: enumeration("Type", ALLERGY_TYPE_LABELS),
    reaction: text("Reaction"),
    severity: enumeration("Severity", ALLERGY_SEVERITY_LABELS),
    noted_on: date("Noted on"),
    archived_at: removedOn,
  },
  medication_orders: {
    medication: text("Medication"),
    frequency: enumeration("Frequency", MEDICATION_FREQUENCY_LABELS),
    instructions: text("Instructions"),
    prescribed_by: STAFF_REFERENCE("Prescribed by"),
    started_on: date("Started"),
    ended_on: date("Ended"),
    status: enumeration("Status", MEDICATION_ORDER_STATUS_LABELS),
    archived_at: removedOn,
  },
  administrations: {
    medication_order_id: reference("Medication", "medicationOrders"),
    administered_at: time("Administered at"),
    administered_by: STAFF_REFERENCE("Administered by"),
    status: enumeration("Status", ADMINISTRATION_STATUS_LABELS),
    notes: text("Notes"),
    archived_at: removedOn,
  },
  vitals: {
    taken_at: time("Taken at"),
    taken_by: STAFF_REFERENCE("Taken by"),
    systolic: text("Systolic (mm Hg)"),
    diastolic: text("Diastolic (mm Hg)"),
    pulse: text("Pulse (bpm)"),
    temperature_f: decimal("Temperature (°F)", 1),
    respiratory_rate: text("Respiratory rate (per min)"),
    oxygen_saturation: text("Oxygen saturation (%)"),
    weight_lb: decimal("Weight (lb)", 1),
    notes: text("Notes"),
    archived_at: removedOn,
  },
  assessments: {
    kind: { label: "Kind", format: (v) => assessmentKindName(v) },
    performed_at: time("Performed at"),
    performed_by: STAFF_REFERENCE("Performed by"),
    findings: text("Findings"),
    score: text("Score"),
    archived_at: removedOn,
  },
  lab_results: {
    description: text("Test"),
    value: text("Value"),
    units: text("Units"),
    reference_low: text("Reference low"),
    reference_high: text("Reference high"),
    abnormal: yesNo("Abnormal"),
    resulted_at: time("Resulted at"),
    archived_at: removedOn,
  },
  care_plans: {
    description: text("Care plan"),
    started_on: date("Started"),
    ended_on: date("Ended"),
    status: enumeration("Status", CARE_PLAN_STATUS_LABELS),
    archived_at: removedOn,
  },
  care_plan_goals: {
    description: text("Goal"),
    intervention: text("Intervention"),
    target_date: date("Target date"),
    status: enumeration("Status", CARE_PLAN_GOAL_STATUS_LABELS),
    archived_at: removedOn,
  },
  incidents: {
    kind: enumeration("Kind", INCIDENT_KIND_LABELS),
    occurred_at: time("Occurred at"),
    description: text("Description"),
    injury_sustained: yesNo("Injury sustained"),
    reported_by: STAFF_REFERENCE("Reported by"),
    archived_at: removedOn,
  },
  progress_notes: {
    written_at: time("Written at"),
    written_by: STAFF_REFERENCE("Written by"),
    body: text("Note"),
    archived_at: removedOn,
  },
  appointments: {
    kind: enumeration("Kind", APPOINTMENT_KIND_LABELS),
    scheduled_at: time("Scheduled for"),
    location: text("Location"),
    purpose: text("Purpose"),
    status: enumeration("Status", APPOINTMENT_STATUS_LABELS),
    scheduled_by: STAFF_REFERENCE("Scheduled by"),
    archived_at: removedOn,
  },
  family_contacts: {
    first_name: text("First name"),
    last_name: text("Last name"),
    relationship: enumeration("Relationship", FAMILY_RELATIONSHIP_LABELS),
    phone: text("Phone"),
    email: text("Email"),
    is_primary: yesNo("Primary contact"),
    notes: text("Notes"),
    archived_at: removedOn,
  },
};

/** Columns that say nothing to a reader: identity, bookkeeping, codes behind a description. */
const HIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "resident_id",
  "facility_id",
  "created_at",
  "updated_at",
  "code",
  "code_system",
  "substance",
  "condition_id",
  "care_plan_id",
  "assessment_id",
]);

export function isHiddenColumn(column: string): boolean {
  return HIDDEN_COLUMNS.has(column);
}

export function columnLabel(table: AuditedTable, column: string): string {
  return COLUMN_SPECS[table][column]?.label ?? humanize(column);
}

/**
 * A stored value as it is shown: null for nothing recorded, otherwise the column's own
 * formatting or a plain rendering of the JSON value.
 */
export function formatColumnValue(
  table: AuditedTable,
  column: string,
  value: unknown,
  references: AuditReferences,
): string | null {
  if (value === null || value === undefined) return null;
  const spec = COLUMN_SPECS[table][column];
  if (spec?.format) return spec.format(value, references);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

/**
 * The columns of a row worth showing, in reading order: the ones this module knows first, in
 * the order above, then any others by name.
 */
export function visibleColumns(table: AuditedTable, columns: Iterable<string>): string[] {
  const present = new Set(columns);
  const known = Object.keys(COLUMN_SPECS[table]).filter((column) => present.has(column));
  const rest = [...present]
    .filter((column) => !(column in COLUMN_SPECS[table]) && !isHiddenColumn(column))
    .sort();
  return [...known, ...rest];
}

/** The reference kind a column's ids resolve through, if any. */
export function referenceKind(table: AuditedTable, column: string): AuditReferenceKind | null {
  return COLUMN_SPECS[table][column]?.reference ?? null;
}

export function assessmentKindName(kind: unknown): string {
  return ASSESSMENT_KIND_BY_KEY.get(kind as never)?.name ?? humanize(String(kind));
}

function humanize(column: string): string {
  const words = column.replace(/_id$/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
