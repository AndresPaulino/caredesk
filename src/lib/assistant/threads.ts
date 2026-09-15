import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database, Json } from "@/lib/supabase/database.types";

import type { AssistantAccessDetails } from "./access";
import {
  sourceRefSchema,
  threadErrorSchema,
  threadTitle,
  toolStepSchema,
  type AssistantMessage,
  type CurrentResident,
  type LoadedThread,
  type SourceRef,
  type ThreadError,
  type ThreadMessage,
  type ThreadSummary,
  type ThreadTurn,
  type ToolStep,
} from "./protocol";

/**
 * Saved threads, read and written through the caller's own session: the policies let a staff
 * member see their own threads and nobody else's (ADR 0003), so a thread id that belongs to
 * someone else is simply not found. A turn is a question row written before the model runs
 * and an answer row written after it, so a thread can be resumed with what the drawer showed:
 * the text, the tools the answer ran, the sources it relied on, and how it ended.
 *
 * Access events are written through `record_assistant_access`, the one function allowed to
 * insert them: it attributes the event to the signed-in staff member and checks that the
 * message is theirs and the resident, if any, is in their scope.
 */

type Client = SupabaseClient<Database>;

export const THREAD_LIST_LIMIT = 50;

export class ThreadNotFoundError extends Error {
  constructor(id: string) {
    super(`No thread ${id} is among your threads`);
    this.name = "ThreadNotFoundError";
  }
}

/** The caller's threads, most recently used first. */
export async function listThreads(supabase: Client): Promise<ThreadSummary[]> {
  const { data, error } = await supabase
    .from("assistant_threads")
    .select("id, title, updated_at, messages:assistant_messages (role)")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(THREAD_LIST_LIMIT);
  if (error) throw new Error(`Could not list threads: ${error.message}`);
  return (data ?? []).map((thread) => ({
    id: thread.id,
    title: thread.title,
    updatedAt: thread.updated_at,
    questionCount: thread.messages.filter((message) => message.role === "user").length,
  }));
}

/** One of the caller's threads with its messages in order, or null when none is visible. */
export async function loadThread(supabase: Client, id: string): Promise<LoadedThread | null> {
  const { data: thread, error } = await supabase
    .from("assistant_threads")
    .select("id, title")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not load the thread: ${error.message}`);
  if (!thread) return null;

  const rows = await loadMessages(supabase, id);
  const residentIds = [
    ...new Set(rows.flatMap((row) => (row.resident_id ? [row.resident_id] : []))),
  ];
  const residents = new Map<string, CurrentResident>();
  if (residentIds.length > 0) {
    const { data, error: residentError } = await supabase
      .from("resident_directory")
      .select("id, full_name")
      .in("id", residentIds);
    if (residentError) throw new Error(`Could not load residents: ${residentError.message}`);
    for (const row of data ?? []) residents.set(row.id, { id: row.id, name: row.full_name });
  }

  return {
    id: thread.id,
    title: thread.title,
    messages: rows.map((row) => toThreadMessage(row, residents)),
  };
}

type MessageRow = Database["public"]["Tables"]["assistant_messages"]["Row"];

async function loadMessages(supabase: Client, threadId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("*")
    .eq("thread_id", threadId)
    .is("archived_at", null)
    .order("position");
  if (error) throw new Error(`Could not load the thread's messages: ${error.message}`);
  return data ?? [];
}

function toThreadMessage(
  row: MessageRow,
  residents: ReadonlyMap<string, CurrentResident>,
): ThreadMessage {
  if (row.role === "user") {
    return {
      id: row.id,
      role: "user",
      content: row.content,
      resident: row.resident_id ? (residents.get(row.resident_id) ?? null) : null,
    };
  }
  const error = threadErrorSchema.safeParse(row.error);
  return {
    id: row.id,
    role: "assistant",
    content: row.content,
    steps: z.array(toolStepSchema).safeParse(row.steps).data ?? [],
    sources: z.array(sourceRefSchema).safeParse(row.sources).data ?? [],
    error: error.success ? error.data : null,
    cutShort:
      row.ended === "max_tokens" || row.ended === "max_iterations" || row.ended === "stopped"
        ? row.ended
        : row.ended === null
          ? "interrupted"
          : null,
    pending: false,
  };
}

// ---------------------------------------------------------------------------------------------
// A turn
// ---------------------------------------------------------------------------------------------

export type StartedTurn = {
  thread: { id: string; title: string };
  questionId: string;
  /** The thread so far, text turns only, ending with the new question. */
  history: ThreadTurn[];
  /** The position the answer will take. */
  answerPosition: number;
};

/**
 * Saves the question: in the thread named, or in a new thread titled by it. Throws
 * `ThreadNotFoundError` when the thread is not one of the caller's.
 */
export async function startTurn(
  supabase: Client,
  {
    threadId,
    staffId,
    question,
    residentId,
  }: { threadId: string | null; staffId: string; question: string; residentId: string | null },
): Promise<StartedTurn> {
  let thread: { id: string; title: string };
  let earlier: MessageRow[] = [];
  if (threadId) {
    const { data, error } = await supabase
      .from("assistant_threads")
      .select("id, title")
      .eq("id", threadId)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new Error(`Could not load the thread: ${error.message}`);
    if (!data) throw new ThreadNotFoundError(threadId);
    thread = data;
    earlier = await loadMessages(supabase, threadId);
  } else {
    const { data, error } = await supabase
      .from("assistant_threads")
      .insert({ staff_id: staffId, title: threadTitle(question) })
      .select("id, title")
      .single();
    if (error) throw new Error(`Could not start a thread: ${error.message}`);
    thread = data;
  }

  const position = earlier.length > 0 ? earlier[earlier.length - 1].position + 1 : 0;
  const { data: saved, error } = await supabase
    .from("assistant_messages")
    .insert({
      thread_id: thread.id,
      position,
      role: "user",
      content: question,
      resident_id: residentId,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not save the question: ${error.message}`);

  return {
    thread,
    questionId: saved.id,
    history: [
      ...earlier.flatMap((row): ThreadTurn[] =>
        row.content.trim() ? [{ role: row.role, content: row.content }] : [],
      ),
      { role: "user", content: question },
    ],
    answerPosition: position + 1,
  };
}

export type FinishedAnswer = {
  id: string;
  threadId: string;
  position: number;
  residentId: string | null;
  content: string;
  steps: ToolStep[];
  sources: SourceRef[];
  ended: Exclude<AssistantMessage["cutShort"], "interrupted"> | "end_turn" | "error";
  error: ThreadError | null;
};

/** Saves the answer as the drawer showed it and marks the thread as used just now. */
export async function finishAnswer(supabase: Client, answer: FinishedAnswer): Promise<void> {
  const { error } = await supabase.from("assistant_messages").insert({
    id: answer.id,
    thread_id: answer.threadId,
    position: answer.position,
    role: "assistant",
    content: answer.content,
    resident_id: answer.residentId,
    steps: answer.steps as unknown as Json,
    sources: answer.sources as unknown as Json,
    ended: answer.ended,
    error: answer.error as Json | null,
  });
  if (error) throw new Error(`Could not save the answer: ${error.message}`);

  const { error: touchError } = await supabase
    .from("assistant_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", answer.threadId);
  if (touchError) throw new Error(`Could not update the thread: ${touchError.message}`);
}

// ---------------------------------------------------------------------------------------------
// Access events
// ---------------------------------------------------------------------------------------------

/** Writes one assistant access event for the question, attributed to the signed-in staff member. */
export async function recordAccess(
  supabase: Client,
  {
    questionId,
    residentId,
    details,
  }: { questionId: string; residentId: string | null; details: AssistantAccessDetails },
): Promise<string> {
  const { data, error } = await supabase.rpc("record_assistant_access", {
    message_id: questionId,
    resident: residentId,
    details: details as unknown as Json,
  });
  if (error) throw new Error(`Could not record the assistant access event: ${error.message}`);
  return data;
}
