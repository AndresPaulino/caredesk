import { z } from "zod";

/**
 * What the drawer and the assistant route say to each other. The drawer posts the thread so
 * far and the current resident; the route answers with a stream of newline-delimited JSON
 * events: the resolved current resident, text as it is generated, each tool as it runs, and
 * how the turn ended. This module is shared by both sides, so it has no server-only imports.
 */

export const TOOL_NAMES = [
  "find_residents",
  "get_resident_summary",
  "get_assessments",
  "get_medication_orders",
  "get_vitals",
  "get_allergies",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const MAX_QUESTION_LENGTH = 4000;

/** The thread as the drawer holds it: text turns only, ending with the new question. */
export const assistantRequestSchema = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
        }),
      )
      .min(1)
      .max(40),
    /** The resident whose page the drawer was opened from, when any. */
    residentId: z.uuid().nullable().optional(),
  })
  .refine((request) => request.messages[request.messages.length - 1]?.role === "user", {
    message: "The last message must be the question",
    path: ["messages"],
  });

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export type ThreadMessageParam = AssistantRequest["messages"][number];

export type CurrentResident = { id: string; name: string };

export type ToolStatus = "running" | "done" | "failed";

export type AssistantEvent =
  /** Sent first: the current resident as the route resolved it under the caller's session. */
  | { type: "context"; resident: CurrentResident | null }
  | { type: "text"; text: string }
  /** One per tool call, twice: when it starts and when it ends, with a line for the status line. */
  | { type: "tool"; id: string; name: ToolName; status: ToolStatus; label: string }
  | { type: "done"; stopReason: "end_turn" | "max_tokens" | "max_iterations" }
  | { type: "error"; kind: "refusal" | "unavailable" | "failed"; message: string };

export function encodeEvent(event: AssistantEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Reassembles events from the chunks a fetch body delivers, which split anywhere. A line that
 * is not an event (a truncated or corrupted one) is dropped rather than breaking the thread.
 */
export function createEventParser() {
  let buffer = "";

  const parseLine = (line: string): AssistantEvent | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      const value: unknown = JSON.parse(trimmed);
      return isEvent(value) ? value : null;
    } catch {
      return null;
    }
  };

  return {
    /** Events completed by this chunk. */
    push(chunk: string): AssistantEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.flatMap((line) => {
        const event = parseLine(line);
        return event ? [event] : [];
      });
    },
    /** Whatever a stream that ended without a final newline still holds. */
    flush(): AssistantEvent[] {
      const event = parseLine(buffer);
      buffer = "";
      return event ? [event] : [];
    },
  };
}

function isEvent(value: unknown): value is AssistantEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}
