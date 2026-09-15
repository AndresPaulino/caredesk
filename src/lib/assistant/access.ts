import { z } from "zod";

import { isRecordTabKey, type RecordTabKey } from "../residents/record-tabs";

import { TOOL_NAMES } from "./protocol";

/**
 * Assistant access events: the audit trail's record that a staff member asked the assistant a
 * question, and that a tool ran on their behalf to answer it. Each is an `audit_events` row
 * with operation `access`, attributed to the asking staff member, naming the resident it
 * concerned when it concerned one, and carrying these details as its values. This module is
 * the shape of those details and the sentence the trail tells from them; it is shared by the
 * route that writes them and the audit trail that reads them, so it has no server-only imports.
 */

/** The table an access event names: the message the question or lookup belongs to. */
export const ASSISTANT_ACCESS_TABLE = "assistant_messages";

export const assistantAccessDetailsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    threadId: z.uuid(),
    question: z.string(),
  }),
  z.object({
    kind: z.literal("tool_call"),
    threadId: z.uuid(),
    tool: z.enum(TOOL_NAMES),
    /** The tool's input as the model gave it. */
    input: z.record(z.string(), z.unknown()),
    /** The lookup as a predicate after the actor's name: "read the resident's vitals". */
    summary: z.string(),
    /** The record tab the lookup read, when one holds those records. */
    tab: z.string().nullable(),
  }),
]);

export type AssistantAccessDetails = z.infer<typeof assistantAccessDetailsSchema>;

export type AssistantAccessStory = {
  /** The predicate after the actor's name. */
  summary: string;
  recordLabel: string;
  tab: RecordTabKey | null;
  /** What to show when the event is opened: the question, or the tool and its input. */
  changes: Array<{ column: string; label: string; after: string }>;
};

/** A question is shown at this length in a feed line; the whole question opens with the event. */
export const QUESTION_PREVIEW_LENGTH = 120;

export const ACCESS_RECORD_LABELS = {
  question: "Assistant question",
  tool_call: "Assistant lookup",
  unknown: "Assistant",
} as const;

/**
 * The story an access event tells. `concernsResident` is whether the event names a resident,
 * which decides where the feed puts the resident's name: "asked the assistant about Harold
 * Doe: ..." against "asked the assistant: ...".
 */
export function describeAssistantAccess(
  values: Record<string, unknown> | null,
  concernsResident: boolean,
): AssistantAccessStory {
  const parsed = assistantAccessDetailsSchema.safeParse(values);
  if (!parsed.success) {
    return {
      summary: "used the assistant",
      recordLabel: ACCESS_RECORD_LABELS.unknown,
      tab: null,
      changes: [],
    };
  }
  const details = parsed.data;
  switch (details.kind) {
    case "question":
      return {
        summary: concernsResident
          ? `asked the assistant about the resident: “${questionPreview(details.question)}”`
          : `asked the assistant: “${questionPreview(details.question)}”`,
        recordLabel: ACCESS_RECORD_LABELS.question,
        tab: null,
        changes: [{ column: "question", label: "Question", after: details.question }],
      };
    case "tool_call":
      return {
        summary: `${details.summary} through the assistant`,
        recordLabel: ACCESS_RECORD_LABELS.tool_call,
        tab: isRecordTabKey(details.tab) ? details.tab : null,
        changes: [
          { column: "tool", label: "Tool", after: details.tool },
          { column: "input", label: "Input", after: formatInput(details.input) },
        ],
      };
  }
}

export function questionPreview(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > QUESTION_PREVIEW_LENGTH
    ? `${oneLine.slice(0, QUESTION_PREVIEW_LENGTH - 1).trimEnd()}…`
    : oneLine;
}

/** "residentId: e844…\nkind: podiatry", one line per input field. */
function formatInput(input: Record<string, unknown>): string {
  const lines = Object.entries(input).map(
    ([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
  return lines.length > 0 ? lines.join("\n") : "(no input)";
}
