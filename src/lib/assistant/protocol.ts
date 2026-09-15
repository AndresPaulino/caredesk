import { z } from "zod";

import { isRecordTabKey, type RecordTabKey } from "../residents/record-tabs";

/**
 * What the drawer and the assistant route say to each other, and the shape of a thread as
 * both sides hold it. The drawer posts one question with the thread to continue and the
 * current resident; the route answers with a stream of newline-delimited JSON events: the
 * thread and the resolved current resident, text as it is generated, each tool as it runs
 * with the sources it read, and how the turn ended. A saved thread comes back from the server
 * as the same messages the drawer builds from the stream. This module is shared by both
 * sides, so it has no server-only imports.
 */

export const TOOL_NAMES = [
  "find_residents",
  "get_resident_summary",
  "get_assessments",
  "get_medication_orders",
  "get_vitals",
  "get_allergies",
  "get_lab_results",
  "get_incidents",
  "get_progress_notes",
  "get_appointments",
  "get_family_contacts",
  "get_audit_trail",
  "get_recent_activity",
  "check_allergy_conflicts",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const MAX_QUESTION_LENGTH = 4000;

/** A thread is titled by its first question, cut to this many characters. */
export const THREAD_TITLE_LENGTH = 80;

/** One question: the thread it continues (or none, to start one) and the current resident. */
export const assistantRequestSchema = z.object({
  threadId: z.uuid().nullable().optional(),
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  /** The resident whose page the drawer was opened from, when any. */
  residentId: z.uuid().nullable().optional(),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export type CurrentResident = { id: string; name: string };

export type ToolStatus = "running" | "done" | "failed";

/** Where a tool's records came from: enough for a source chip to link to the resident page and tab. */
export type SourceRef = {
  residentId: string;
  residentName: string;
  /** The record tab holding the records, or null for the resident page itself. */
  tab: RecordTabKey | null;
};

/** One tool run for one answer, as the status line shows it. */
export type ToolStep = { id: string; name: ToolName; label: string; status: ToolStatus };

export type ThreadError = { kind: "refusal" | "unavailable" | "failed"; message: string };

export type AssistantEvent =
  /** Sent first: the thread this question belongs to and the current resident as the route resolved it. */
  | {
      type: "context";
      thread: { id: string; title: string };
      questionId: string;
      answerId: string;
      resident: CurrentResident | null;
    }
  | { type: "text"; text: string }
  /** One per tool call, twice: as it starts and as it ends, with a line for the status line and, when done, its sources. */
  | {
      type: "tool";
      id: string;
      name: ToolName;
      status: ToolStatus;
      label: string;
      sources?: SourceRef[];
    }
  | { type: "done"; stopReason: "end_turn" | "max_tokens" | "max_iterations" }
  | { type: "error"; kind: ThreadError["kind"]; message: string };

// ---------------------------------------------------------------------------------------------
// The thread as the drawer shows it and as a saved thread is returned
// ---------------------------------------------------------------------------------------------

export type UserMessage = {
  id: string;
  role: "user";
  content: string;
  /** The current resident when the question was asked, so a resumed thread still says who "he" was. */
  resident: CurrentResident | null;
};

export type AssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  /** Each tool the assistant ran for this answer, in order. */
  steps: ToolStep[];
  /** The records the answer relied on, one chip each, in the order they were read. */
  sources: SourceRef[];
  error: ThreadError | null;
  /** Set when the answer ended before the assistant was finished. */
  cutShort: "max_tokens" | "max_iterations" | "stopped" | "interrupted" | null;
  /** True while the answer is streaming in. */
  pending: boolean;
};

export type ThreadMessage = UserMessage | AssistantMessage;

/** A text turn as the model takes it: the thread so far, without tool calls. */
export type ThreadTurn = { role: "user" | "assistant"; content: string };

export type ThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  questionCount: number;
};

export type LoadedThread = { id: string; title: string; messages: ThreadMessage[] };

/** The stored shape of an answer's steps and sources, checked when a saved thread is read back. */
export const toolStepSchema = z.object({
  id: z.string(),
  name: z.enum(TOOL_NAMES),
  label: z.string(),
  status: z.enum(["running", "done", "failed"]),
});

export const sourceRefSchema = z.object({
  residentId: z.string(),
  residentName: z.string(),
  tab: z
    .string()
    .nullable()
    .transform((tab) => (isRecordTabKey(tab) ? tab : null)),
});

export const threadErrorSchema = z.object({
  kind: z.enum(["refusal", "unavailable", "failed"]),
  message: z.string(),
});

/** The sources an answer shows: one chip per resident and tab, in first-read order. */
export function mergeSources(current: readonly SourceRef[], incoming: readonly SourceRef[]) {
  const merged = [...current];
  for (const source of incoming) {
    if (!merged.some((existing) => sameSource(existing, source))) merged.push(source);
  }
  return merged;
}

function sameSource(a: SourceRef, b: SourceRef): boolean {
  return a.residentId === b.residentId && a.tab === b.tab;
}

/** A thread's title: its first question on one line, cut to `THREAD_TITLE_LENGTH`. */
export function threadTitle(question: string): string {
  const oneLine = question.replace(/\s+/g, " ").trim();
  return oneLine.length > THREAD_TITLE_LENGTH
    ? `${oneLine.slice(0, THREAD_TITLE_LENGTH - 1).trimEnd()}…`
    : oneLine;
}

// ---------------------------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------------------------

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
