import "server-only";

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";

import { ASSESSMENT_KINDS } from "@/lib/clinical/assessment-kinds";
import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  INCIDENT_KIND_LABELS,
} from "@/lib/clinical/labels";
import { VITAL_LABELS, VITAL_RANGES, type VitalReading } from "@/lib/clinical/vital-ranges";
import type { RecordTabKey } from "@/lib/residents/record-tabs";
import type { Enums } from "@/lib/supabase/database.types";

import type { AssistantEvent, SourceRef, ToolName } from "./protocol";
import {
  ADMINISTRATIONS_PER_ORDER,
  APPOINTMENTS_LIMIT,
  ASSESSMENTS_LIMIT,
  AUDIT_EVENTS_LIMIT,
  AUDIT_EVENTS_MAX_LIMIT,
  AUDIT_RECORD_TYPES,
  FALL_WINDOW_DAYS,
  FIND_RESIDENTS_LIMIT,
  INCIDENTS_LIMIT,
  LAB_RESULTS_LIMIT,
  PROGRESS_NOTES_LIMIT,
  PROGRESS_NOTES_MAX_LIMIT,
  RECORDS_MAX_LIMIT,
  VITALS_LIMIT,
  VITALS_MAX_LIMIT,
  checkAllergyConflicts,
  findResidents,
  getAllergies,
  getAppointments,
  getAssessments,
  getAuditTrailForAssistant,
  getFamilyContacts,
  getIncidents,
  getLabResults,
  getMedicationOrders,
  getProgressNotes,
  getRecentActivity,
  getResidentSummary,
  getVitals,
  type ToolContext,
} from "./tools";

/**
 * The tools as the model sees them: a name, a description that teaches when to call it, a zod
 * schema the SDK turns into JSON Schema and validates inputs against, and a `run` that calls
 * the function in `tools/` with the caller's client. Each run reports itself to the drawer's
 * status line as it starts and as it ends (with the sources it read, for the chips), and is
 * written to the audit trail as an assistant access event before its result goes back to the
 * model: a lookup that cannot be recorded is a lookup that did not happen.
 */

export type ToolEvent = Extract<AssistantEvent, { type: "tool" }>;

/** One tool call as the audit trail records it. */
export type ToolAccess = {
  tool: ToolName;
  input: Record<string, unknown>;
  /** The resident the lookup concerned, when it concerned one the caller may see. */
  residentId: string | null;
  tab: RecordTabKey | null;
  /** The lookup as a predicate after the actor's name: "read the resident's vitals". */
  summary: string;
};

export type ToolHooks = {
  onEvent: (event: ToolEvent) => void;
  /** Records the call in the audit trail; a rejection fails the call. */
  onAccess: (access: ToolAccess) => Promise<void>;
};

/** What a tool says to the model when the resident it was asked about is not visible. */
export const RESIDENT_NOT_VISIBLE =
  "No resident with that id is among the residents you can see. Tell the staff member you can't find the resident.";

/** What the audit trail says about a lookup that named a resident the caller may not see. */
export const OUT_OF_SCOPE_ACCESS = "asked about a resident outside their scope";

const residentId = z
  .uuid()
  .describe("The resident's id, from find_residents or from the current resident");

const dateOrInstant = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T.*)?$/, "A calendar date (YYYY-MM-DD) or an ISO 8601 instant")
    .describe(
      `${what}: a calendar date such as 2026-09-14, meaning that whole day in Eastern time, or an ISO 8601 instant`,
    );

const scopeFields = {
  unit: z.string().optional().describe('A unit code such as "B" or part of a unit name'),
  facility: z
    .string()
    .optional()
    .describe('A facility code such as "MDW" or part of a facility name'),
};

const auditWindowFields = {
  since: dateOrInstant("Only events at or after this").optional(),
  until: dateOrInstant(
    "Only events before this (a date means through the end of that day)",
  ).optional(),
  recordTypes: z
    .array(z.enum(AUDIT_RECORD_TYPES))
    .optional()
    .describe(
      "Only these record types; every type by default. medications covers orders and administrations",
    ),
  includeAssistantAccess: z
    .boolean()
    .optional()
    .describe("Also return assistant questions and lookups (left out by default)"),
  limit: z.number().int().min(1).max(AUDIT_EVENTS_MAX_LIMIT).optional(),
};

const assessmentKinds = ASSESSMENT_KINDS.map((info) => `${info.kind} (${info.name})`).join(", ");

const vitalRanges = (Object.keys(VITAL_RANGES) as VitalReading[])
  .map((reading) => `${VITAL_LABELS[reading]} ${VITAL_RANGES[reading].join(" to ")}`)
  .join("; ");

const enumList = (labels: Readonly<Record<string, string>>) =>
  Object.entries(labels)
    .map(([key, label]) => `${key} (${label})`)
    .join(", ");

const INCIDENT_KINDS = Object.keys(INCIDENT_KIND_LABELS) as Enums<"incident_kind">[];
const APPOINTMENT_KINDS = Object.keys(APPOINTMENT_KIND_LABELS) as Enums<"appointment_kind">[];
const APPOINTMENT_STATUSES = Object.keys(
  APPOINTMENT_STATUS_LABELS,
) as Enums<"appointment_status">[];

function sourcesOf(result: unknown): SourceRef[] {
  if (typeof result !== "object" || result === null) return [];
  if ("source" in result) return [(result as { source: SourceRef }).source];
  if ("sources" in result) return (result as { sources: SourceRef[] }).sources;
  return [];
}

export function assistantTools(
  context: ToolContext,
  { onEvent, onAccess }: ToolHooks,
): BetaRunnableTool[] {
  const define = <Schema extends z.ZodType<Record<string, unknown>>, Result>(
    name: ToolName,
    description: string,
    inputSchema: Schema,
    run: (input: z.infer<Schema>) => Promise<Result | null>,
    label: {
      running: (input: z.infer<Schema>) => string;
      done: (input: z.infer<Schema>, result: Result) => string;
      /** The lookup for the audit trail, after the actor's name. */
      access: (input: z.infer<Schema>, result: Result) => string;
    },
  ) =>
    betaZodTool({
      name,
      description,
      inputSchema,
      run: async (input, runContext) => {
        const id = runContext?.toolUse.id ?? crypto.randomUUID();
        const report = (status: ToolEvent["status"], text: string, sources?: SourceRef[]) =>
          onEvent({ type: "tool", id, name, status, label: text, sources });

        report("running", label.running(input));
        let result: Result | null;
        try {
          result = await run(input);
          const sources = sourcesOf(result);
          await onAccess({
            tool: name,
            input,
            residentId:
              result !== null && "source" in (result as object)
                ? (sources[0]?.residentId ?? null)
                : null,
            tab: sources[0]?.tab ?? null,
            summary: result === null ? OUT_OF_SCOPE_ACCESS : label.access(input, result),
          });
        } catch (error) {
          report("failed", `${label.running(input)} failed`);
          throw error;
        }
        if (result === null) {
          report("done", "Resident not found");
          return RESIDENT_NOT_VISIBLE;
        }
        report("done", label.done(input, result), sourcesOf(result));
        return JSON.stringify(result);
      },
    });

  const forResident = (result: { source: SourceRef }) => result.source.residentName;

  return [
    define(
      "find_residents",
      "Find residents by name or room number, among the residents the signed-in staff member may see. " +
        "Search by last name, full name, or room number and leave out honorifics such as Mr. or Mrs. " +
        `Returns up to ${FIND_RESIDENTS_LIMIT} matches with each resident's id, status (current or former), facility, unit, and room. ` +
        "No match means the resident cannot be found; more than one plausible match means you must ask which one. " +
        "Narrow by unit or facility when the question names one.",
      z.object({
        query: z.string().min(1).describe("A name, part of a name, or a room number"),
        ...scopeFields,
        status: z
          .enum(["current", "former", "all"])
          .optional()
          .describe("Limit to current or former residents; all by default"),
      }),
      (input) => findResidents(context, input),
      {
        running: (input) => `Searching residents for “${input.query}”`,
        done: (input, result) =>
          result.total === 0
            ? `No residents match “${input.query}”`
            : `Found ${count(result.total, "resident")} matching “${input.query}”`,
        access: (input) => `searched residents for “${input.query}”`,
      },
    ),

    define(
      "get_resident_summary",
      "The essentials of one resident: name, age, sex, facility, unit, room, status (current, or former with " +
        "when and why the stay ended), admission date, code status, diet, mobility, and the conditions on record, " +
        "active and resolved.",
      z.object({ residentId }),
      (input) => getResidentSummary(context, input),
      {
        running: () => "Reading the resident's summary",
        done: (_input, result) => `Read the summary for ${forResident(result)}`,
        access: () => "read the resident's summary",
      },
    ),

    define(
      "get_assessments",
      "A resident's assessments: dated clinical examinations of one kind each. Returns, per kind, when it was " +
        "last done, when the next is due, and whether it is overdue, plus the assessments themselves with " +
        `findings, newest first, at most ${ASSESSMENTS_LIMIT}. Kinds: ${assessmentKinds}. ` +
        "A podiatry or foot exam is podiatry; a doctor's visit is physician_visit; an eye exam is vision; " +
        "a fall assessment or Morse score is fall_risk; bloodwork is lab_draw. " +
        "Pass a kind for that kind only, or omit it for every kind.",
      z.object({
        residentId,
        kind: z
          .enum(ASSESSMENT_KINDS.map((info) => info.kind))
          .optional()
          .describe("One assessment kind; omit for all kinds"),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      (input) => getAssessments(context, input),
      {
        running: (input) =>
          input.kind
            ? `Reading ${kindName(input.kind).toLowerCase()} assessments`
            : "Reading assessments",
        done: (input, result) =>
          `Read ${count(result.total, input.kind ? `${kindName(input.kind).toLowerCase()} assessment` : "assessment")} for ${forResident(result)}`,
        access: (input) =>
          input.kind
            ? `read the resident's ${kindName(input.kind).toLowerCase()} assessments`
            : "read the resident's assessments",
      },
    ),

    define(
      "get_medication_orders",
      "A resident's medication orders with the condition each treats and its most recent administrations " +
        "(each time a dose was given, refused, or held), so you can say what a resident takes, what for, " +
        `and when it was last given. Active orders by default, with the last ${ADMINISTRATIONS_PER_ORDER} administrations of each; ` +
        "ask for discontinued or all orders to see past medications. Each order carries the date it started and, " +
        "if discontinued, the date it ended: an order that ended and another that started around the same date " +
        "is a medication change.",
      z.object({
        residentId,
        status: z
          .enum(["active", "discontinued", "all"])
          .optional()
          .describe("Which orders to return; active by default"),
        administrationsPerOrder: z
          .number()
          .int()
          .min(0)
          .max(20)
          .optional()
          .describe(
            `Most recent administrations per order; ${ADMINISTRATIONS_PER_ORDER} by default`,
          ),
      }),
      (input) => getMedicationOrders(context, input),
      {
        running: () => "Reading medication orders",
        done: (_input, result) =>
          `Read ${count(result.total, "medication order")} for ${forResident(result)}`,
        access: () => "read the resident's medication orders",
      },
    ),

    define(
      "get_vitals",
      "A resident's recent vital signs, newest first: blood pressure, pulse, temperature (°F), respiratory " +
        "rate, oxygen saturation (%), and weight (lb), with every reading outside its normal range named. " +
        `Normal ranges: ${vitalRanges}. Returns the ${VITALS_LIMIT} most recent sets by default; ` +
        `ask for up to ${VITALS_MAX_LIMIT}, or only sets taken since an instant.`,
      z.object({
        residentId,
        limit: z.number().int().min(1).max(VITALS_MAX_LIMIT).optional(),
        since: z.iso.datetime({ offset: true }).optional().describe("ISO 8601 instant"),
      }),
      (input) => getVitals(context, input),
      {
        running: () => "Reading vitals",
        done: (_input, result) =>
          `Read ${count(result.vitals.length, "set")} of vitals for ${forResident(result)}`,
        access: () => "read the resident's vitals",
      },
    ),

    define(
      "get_allergies",
      "A resident's documented allergies and intolerances, most severe first, each with its category " +
        "(medication, food, environment), the medication substance when it is one, the reaction, and the severity. " +
        "To check allergies against the resident's current medications, use check_allergy_conflicts instead.",
      z.object({ residentId }),
      (input) => getAllergies(context, input),
      {
        running: () => "Reading allergies",
        done: (_input, result) =>
          `Read ${count(result.total, "allergy", "allergies")} for ${forResident(result)}`,
        access: () => "read the resident's allergies",
      },
    ),

    define(
      "get_lab_results",
      "A resident's lab results, newest first, each with its value, units, reference range, and whether it " +
        "is abnormal, plus the latest result of each test with the one before it for the trend. " +
        `Returns the ${LAB_RESULTS_LIMIT} most recent by default; pass part of a test name (potassium, A1c, ` +
        "creatinine) for that test only, or a date to see results since then.",
      z.object({
        residentId,
        test: z.string().optional().describe("Part of a test name; omit for every test"),
        since: dateOrInstant("Only results at or after this").optional(),
        limit: z.number().int().min(1).max(RECORDS_MAX_LIMIT).optional(),
      }),
      (input) => getLabResults(context, input),
      {
        running: (input) => (input.test ? `Reading ${input.test} results` : "Reading lab results"),
        done: (_input, result) =>
          `Read ${count(result.total, "lab result")} for ${forResident(result)}`,
        access: (input) =>
          input.test
            ? `read the resident's ${input.test} lab results`
            : "read the resident's lab results",
      },
    ),

    define(
      "get_incidents",
      "A resident's incident reports (falls, medication errors, behavioral incidents), newest first, each " +
        "with when it happened, what happened, whether there was an injury, and who reported it, plus the " +
        `number of falls in the last ${FALL_WINDOW_DAYS} days. Kinds: ${enumList(INCIDENT_KIND_LABELS)}. ` +
        `At most ${INCIDENTS_LIMIT} by default.`,
      z.object({
        residentId,
        kind: z.enum(INCIDENT_KINDS).optional().describe("One kind; omit for all"),
        since: dateOrInstant("Only incidents at or after this").optional(),
        limit: z.number().int().min(1).max(RECORDS_MAX_LIMIT).optional(),
      }),
      (input) => getIncidents(context, input),
      {
        running: (input) =>
          input.kind
            ? `Reading ${INCIDENT_KIND_LABELS[input.kind].toLowerCase()} reports`
            : "Reading incidents",
        done: (_input, result) =>
          `Read ${count(result.total, "incident")} for ${forResident(result)}`,
        access: (input) =>
          input.kind
            ? `read the resident's ${INCIDENT_KIND_LABELS[input.kind].toLowerCase()} reports`
            : "read the resident's incidents",
      },
    ),

    define(
      "get_progress_notes",
      "A resident's progress notes, newest first, each with when it was written, by whom, and the full text. " +
        `Returns the ${PROGRESS_NOTES_LIMIT} most recent by default, up to ${PROGRESS_NOTES_MAX_LIMIT}; pass ` +
        "a date to read notes since then, or a word or phrase (daughter, appetite, pain) for notes that mention it.",
      z.object({
        residentId,
        since: dateOrInstant("Only notes written at or after this").optional(),
        search: z.string().optional().describe("Only notes mentioning this text"),
        limit: z.number().int().min(1).max(PROGRESS_NOTES_MAX_LIMIT).optional(),
      }),
      (input) => getProgressNotes(context, input),
      {
        running: (input) =>
          input.search
            ? `Searching progress notes for “${input.search}”`
            : "Reading progress notes",
        done: (_input, result) =>
          `Read ${count(result.notes.length, "progress note")} for ${forResident(result)}`,
        access: (input) =>
          input.search
            ? `searched the resident's progress notes for “${input.search}”`
            : "read the resident's progress notes",
      },
    ),

    define(
      "get_appointments",
      "A resident's appointments (dialysis, specialist, hospital, imaging, dental, other) with when, where, " +
        "why, the status (scheduled, completed, cancelled), and who scheduled it, plus the next scheduled " +
        `appointment. Ask for upcoming ones (soonest first), past ones, or all (newest first); at most ${APPOINTMENTS_LIMIT} by default. ` +
        `Kinds: ${enumList(APPOINTMENT_KIND_LABELS)}. A completed hospital appointment is a hospital stay or transfer.`,
      z.object({
        residentId,
        window: z.enum(["upcoming", "past", "all"]).optional().describe("All by default"),
        kind: z.enum(APPOINTMENT_KINDS).optional().describe("One kind; omit for all"),
        status: z.enum(APPOINTMENT_STATUSES).optional().describe("One status; omit for all"),
        limit: z.number().int().min(1).max(RECORDS_MAX_LIMIT).optional(),
      }),
      (input) => getAppointments(context, input),
      {
        running: (input) =>
          input.window === "upcoming" ? "Reading upcoming appointments" : "Reading appointments",
        done: (_input, result) =>
          `Read ${count(result.total, "appointment")} for ${forResident(result)}`,
        access: (input) =>
          input.window === "upcoming"
            ? "read the resident's upcoming appointments"
            : "read the resident's appointments",
      },
    ),

    define(
      "get_family_contacts",
      "A resident's family contacts: name, relationship, phone, email, notes, and which one is the primary " +
        "contact to call first.",
      z.object({ residentId }),
      (input) => getFamilyContacts(context, input),
      {
        running: () => "Reading family contacts",
        done: (_input, result) =>
          `Read ${count(result.total, "family contact")} for ${forResident(result)}`,
        access: () => "read the resident's family contacts",
      },
    ),

    define(
      "get_audit_trail",
      "One resident's audit trail: every change to their record, newest first, each with who made it, when, " +
        "a sentence saying what they did, the record type, and the fields that changed with their values before " +
        "and after. Use it for who changed something, when, or what changed over a period. Filter by date " +
        'window and record type (for medication changes pass recordTypes: ["medications"]). Assistant questions ' +
        `and lookups are left out unless asked for. At most ${AUDIT_EVENTS_LIMIT} events by default, up to ${AUDIT_EVENTS_MAX_LIMIT}. ` +
        "No events in a window means nothing was changed then, as far as the trail records.",
      z.object({ residentId, ...auditWindowFields }),
      (input) => getAuditTrailForAssistant(context, input),
      {
        running: () => "Reading the audit trail",
        done: (_input, result) =>
          `Read ${count(result.total, "audit event")} for ${forResident(result)}`,
        access: (input) =>
          input.recordTypes && input.recordTypes.length > 0
            ? `read the resident's audit trail for ${listOf(input.recordTypes)}`
            : "read the resident's audit trail",
      },
    ),

    define(
      "get_recent_activity",
      "Recent changes across a unit, a facility, or everything the staff member can see: who did what to which " +
        "resident, newest first, with the same date window and record type filters as get_audit_trail. Use it " +
        'for questions about a unit or facility rather than one resident ("what happened on Unit B last night", ' +
        '"who has recorded vitals today"). Name the unit and, for an admin, the facility; the result says which ' +
        "units it covered. Assistant questions and lookups are left out unless asked for.",
      z.object({ ...scopeFields, ...auditWindowFields }),
      (input) => getRecentActivity(context, input),
      {
        running: (input) => `Reading recent activity for ${scopeLabel(input)}`,
        done: (_input, result) =>
          `Read ${count(result.total, "audit event")} for ${result.scope.description}`,
        access: (_input, result) => `reviewed recent activity for ${result.scope.description}`,
      },
    ),

    define(
      "check_allergy_conflicts",
      "Compare documented medication allergies against active medication orders. For one resident, returns " +
        "each conflicting pair (allergy, substance, medication, severity, reaction) or none. For a unit, a " +
        "facility, or everything the staff member can see, returns the residents who have a conflict, with " +
        'the pairs, and how many residents were checked. Use it for "is she allergic to anything she is ' +
        'prescribed" and "which residents on Unit B have an allergy conflict".',
      z.object({
        residentId: residentId
          .optional()
          .describe("One resident; omit to check a unit or facility"),
        ...scopeFields,
      }),
      (input) => checkAllergyConflicts(context, input),
      {
        running: (input) =>
          input.residentId
            ? "Checking allergies against medication orders"
            : `Checking allergy conflicts for ${scopeLabel(input)}`,
        done: (_input, result) =>
          result.mode === "resident"
            ? `Found ${count(result.conflicts.length, "allergy conflict")} for ${result.resident.name}`
            : `Checked ${count(result.residentsChecked, "resident")} on ${result.scope.description}: ${count(result.residentsWithConflicts.length, "conflict")}`,
        access: (_input, result) =>
          result.mode === "resident"
            ? "checked the resident's medications against their allergies"
            : `checked allergy conflicts for ${result.scope.description}`,
      },
    ),
  ] satisfies BetaRunnableTool[];
}

function kindName(kind: (typeof ASSESSMENT_KINDS)[number]["kind"]): string {
  return ASSESSMENT_KINDS.find((info) => info.kind === kind)?.name ?? kind;
}

function scopeLabel({ unit, facility }: { unit?: string; facility?: string }): string {
  if (unit && facility) return `Unit ${unit} at ${facility}`;
  if (unit) return `Unit ${unit}`;
  if (facility) return facility;
  return "everything you can see";
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function listOf(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
