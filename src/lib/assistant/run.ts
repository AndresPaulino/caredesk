import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta";

import { buildSystemPrompt, type PromptStaff } from "./prompt";
import type { AssistantEvent, CurrentResident, ThreadMessageParam } from "./protocol";
import { assistantTools } from "./tool-definitions";
import type { ToolContext } from "./tools";

/**
 * One turn of the assistant: the thread so far goes to Claude through the SDK's tool runner,
 * which calls the tools as the model asks for them and loops until the model answers. Text
 * streams out as it is generated, each tool reports itself as it runs, and the turn ends
 * with either a `done` or an `error` event, so the drawer always has something to show.
 *
 * The model and the caller's client are handed in: the model is one configuration value
 * (`ANTHROPIC_MODEL`), and the client is the signed-in staff member's own session, so the
 * tools see exactly what that person may see (ADR 0003).
 */

/** Room for adaptive thinking plus an answer; a nurse's answer is a paragraph or two. */
export const MAX_TOKENS = 16_000;

/** Tool-use rounds per question. A question needs a search and a few reads, not more. */
export const MAX_ITERATIONS = 8;

export type RunAssistantOptions = ToolContext & {
  client: Anthropic;
  model: string;
  staff: PromptStaff;
  resident: CurrentResident | null;
  messages: ThreadMessageParam[];
  signal?: AbortSignal;
  emit: (event: AssistantEvent) => void;
};

export async function runAssistant({
  client,
  model,
  supabase,
  now,
  staff,
  resident,
  messages,
  signal,
  emit,
}: RunAssistantOptions): Promise<void> {
  const runner = client.beta.messages.toolRunner(
    {
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      system: buildSystemPrompt({ staff, resident, today: now }),
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools: assistantTools({ supabase, now }, emit),
      messages: messages.map((message) => ({ role: message.role, content: message.content })),
      max_iterations: MAX_ITERATIONS,
    },
    { signal },
  );

  let final: BetaMessage | undefined;
  // Text before a tool call and text after it are separate blocks; keep them separate paragraphs.
  let needsBreak = false;
  try {
    for await (const stream of runner) {
      let wrote = false;
      stream.on("text", (delta) => {
        if (!wrote && needsBreak) emit({ type: "text", text: "\n\n" });
        wrote = true;
        emit({ type: "text", text: delta });
      });
      final = await stream.finalMessage();
      needsBreak = needsBreak || wrote;
    }
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) return;
    emit(describeFailure(error));
    return;
  }

  if (!final) {
    emit({ type: "error", kind: "failed", message: "The assistant did not answer." });
    return;
  }
  switch (final.stop_reason) {
    case "refusal":
      emit({
        type: "error",
        kind: "refusal",
        message: final.stop_details?.explanation
          ? `The assistant declined to answer this question: ${final.stop_details.explanation}`
          : "The assistant declined to answer this question.",
      });
      return;
    case "max_tokens":
      emit({ type: "done", stopReason: "max_tokens" });
      return;
    case "tool_use":
      // The runner stopped at `max_iterations` with the model still asking for tools.
      emit({ type: "done", stopReason: "max_iterations" });
      return;
    default:
      emit({ type: "done", stopReason: "end_turn" });
  }
}

/** A sentence for the thread, without the request internals an SDK message carries. */
function describeFailure(error: unknown): AssistantEvent {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      type: "error",
      kind: "unavailable",
      message: "The assistant's API key was rejected. Check ANTHROPIC_API_KEY on the server.",
    };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return {
      type: "error",
      kind: "unavailable",
      message: "The assistant is busy right now. Try again in a moment.",
    };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return {
      type: "error",
      kind: "unavailable",
      message: "The assistant could not reach Claude. Check the connection and try again.",
    };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      type: "error",
      kind: "unavailable",
      message: `The assistant's request failed (${error.status ?? "no status"}). Try again.`,
    };
  }
  console.error("[assistant] turn failed", error);
  return {
    type: "error",
    kind: "failed",
    message: "The assistant ran into a problem and could not finish. Try again.",
  };
}
