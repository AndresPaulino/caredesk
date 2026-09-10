import "server-only";

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";

import { ASSESSMENT_KINDS } from "@/lib/clinical/assessment-kinds";
import { VITAL_LABELS, VITAL_RANGES, type VitalReading } from "@/lib/clinical/vital-ranges";

import type { AssistantEvent, ToolName } from "./protocol";
import {
  ADMINISTRATIONS_PER_ORDER,
  ASSESSMENTS_LIMIT,
  FIND_RESIDENTS_LIMIT,
  VITALS_LIMIT,
  VITALS_MAX_LIMIT,
  findResidents,
  getAllergies,
  getAssessments,
  getMedicationOrders,
  getResidentSummary,
  getVitals,
  type SourceRef,
  type ToolContext,
} from "./tools";

/**
 * The core tools as the model sees them: a name, a description that teaches when to call it,
 * a zod schema the SDK turns into JSON Schema and validates inputs against, and a `run` that
 * calls the function in `tools.ts` with the caller's client. Each run reports itself twice to
 * the drawer's status line, as it starts and as it ends, in words a nurse would use.
 */

export type ToolEvent = Extract<AssistantEvent, { type: "tool" }>;

/** What a tool says to the model when the resident it was asked about is not visible. */
export const RESIDENT_NOT_VISIBLE =
  "No resident with that id is among the residents you can see. Tell the staff member you can't find the resident.";

const residentId = z
  .uuid()
  .describe("The resident's id, from find_residents or from the current resident");

const assessmentKinds = ASSESSMENT_KINDS.map((info) => `${info.kind} (${info.name})`).join(", ");

const vitalRanges = (Object.keys(VITAL_RANGES) as VitalReading[])
  .map((reading) => `${VITAL_LABELS[reading]} ${VITAL_RANGES[reading].join(" to ")}`)
  .join("; ");

export function assistantTools(
  context: ToolContext,
  onEvent: (event: ToolEvent) => void,
): BetaRunnableTool[] {
  const define = <Schema extends z.ZodType, Result>(
    name: ToolName,
    description: string,
    inputSchema: Schema,
    run: (input: z.infer<Schema>) => Promise<Result | null>,
    label: {
      running: (input: z.infer<Schema>) => string;
      done: (input: z.infer<Schema>, result: Result) => string;
    },
  ) =>
    betaZodTool({
      name,
      description,
      inputSchema,
      run: async (input, runContext) => {
        const id = runContext?.toolUse.id ?? crypto.randomUUID();
        const report = (status: ToolEvent["status"], text: string) =>
          onEvent({ type: "tool", id, name, status, label: text });

        report("running", label.running(input));
        let result: Result | null;
        try {
          result = await run(input);
        } catch (error) {
          report("failed", `${label.running(input)} failed`);
          throw error;
        }
        if (result === null) {
          report("done", "Resident not found");
          return RESIDENT_NOT_VISIBLE;
        }
        report("done", label.done(input, result));
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
        unit: z.string().optional().describe('A unit code such as "B" or part of a unit name'),
        facility: z
          .string()
          .optional()
          .describe('A facility code such as "MDW" or part of a facility name'),
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
      },
    ),

    define(
      "get_medication_orders",
      "A resident's medication orders with the condition each treats and its most recent administrations " +
        "(each time a dose was given, refused, or held), so you can say what a resident takes, what for, " +
        `and when it was last given. Active orders by default, with the last ${ADMINISTRATIONS_PER_ORDER} administrations of each; ` +
        "ask for discontinued or all orders to see past medications.",
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
      },
    ),

    define(
      "get_allergies",
      "A resident's documented allergies and intolerances, most severe first, each with its category " +
        "(medication, food, environment), the medication substance when it is one, the reaction, and the severity.",
      z.object({ residentId }),
      (input) => getAllergies(context, input),
      {
        running: () => "Reading allergies",
        done: (_input, result) =>
          `Read ${count(result.total, "allergy", "allergies")} for ${forResident(result)}`,
      },
    ),
  ];
}

function kindName(kind: (typeof ASSESSMENT_KINDS)[number]["kind"]): string {
  return ASSESSMENT_KINDS.find((info) => info.kind === kind)?.name ?? kind;
}

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
