import { useCallback, useEffect, useRef, useState } from "react";

import {
  createEventParser,
  type AssistantEvent,
  type AssistantRequest,
  type CurrentResident,
  type ThreadMessageParam,
  type ToolStatus,
} from "@/lib/assistant/protocol";

/**
 * The thread as the drawer shows it, and the one way to add to it: `ask` posts the question
 * with the thread so far, then applies the streamed events to the pending answer as they
 * arrive. The thread lives in memory for now; ticket 11 saves it.
 */

export type ToolStep = { id: string; label: string; status: ToolStatus };

export type ThreadError = Extract<AssistantEvent, { type: "error" }>;

export type UserMessage = { id: string; role: "user"; content: string };

export type AssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  /** Each tool the assistant ran for this answer, in order. */
  steps: ToolStep[];
  /** The current resident as the server resolved it for this question. */
  resident: CurrentResident | null;
  error: Pick<ThreadError, "kind" | "message"> | null;
  /** Set when the answer ended before the assistant was finished. */
  cutShort: "max_tokens" | "max_iterations" | "stopped" | null;
  pending: boolean;
};

export type ThreadMessage = UserMessage | AssistantMessage;

export type ThreadStatus = "idle" | "streaming";

export function useAssistantThread() {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [status, setStatus] = useState<ThreadStatus>("idle");
  const messagesRef = useRef<ThreadMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(async (question: string, residentId: string | null) => {
    const content = question.trim();
    if (!content || abortRef.current) return;

    const userMessage: UserMessage = { id: newId(), role: "user", content };
    const answerId = newId();
    const history = toParams([...messagesRef.current, userMessage]);
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: answerId,
        role: "assistant",
        content: "",
        steps: [],
        resident: null,
        error: null,
        cutShort: null,
        pending: true,
      },
    ]);
    setStatus("streaming");

    const controller = new AbortController();
    abortRef.current = controller;
    const update = (patch: (message: AssistantMessage) => AssistantMessage) =>
      setMessages((current) =>
        current.map((message) =>
          message.id === answerId && message.role === "assistant" ? patch(message) : message,
        ),
      );

    try {
      const request: AssistantRequest = { messages: history, residentId };
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok || !response.body || response.redirected) {
        const error = await describeResponse(response);
        update((message) => ({ ...message, error }));
        return;
      }

      const parser = createEventParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      const apply = (event: AssistantEvent) => {
        switch (event.type) {
          case "context":
            update((message) => ({ ...message, resident: event.resident }));
            break;
          case "text":
            update((message) => ({ ...message, content: message.content + event.text }));
            break;
          case "tool":
            update((message) => ({ ...message, steps: upsertStep(message.steps, event) }));
            break;
          case "done":
            update((message) => ({
              ...message,
              cutShort: event.stopReason === "end_turn" ? null : event.stopReason,
            }));
            break;
          case "error":
            update((message) => ({
              ...message,
              error: { kind: event.kind, message: event.message },
            }));
            break;
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const event of parser.push(decoder.decode(value, { stream: true }))) apply(event);
      }
      for (const event of parser.flush()) apply(event);
    } catch (error) {
      if (controller.signal.aborted) {
        update((message) => ({ ...message, cutShort: "stopped" }));
      } else {
        console.error("[assistant] request failed", error);
        update((message) => ({
          ...message,
          error: {
            kind: "unavailable",
            message: "The assistant could not be reached. Check your connection and try again.",
          },
        }));
      }
    } finally {
      // A tool still marked running when the stream ends did not report back.
      update((message) => ({
        ...message,
        pending: false,
        steps: message.steps.map((step) =>
          step.status === "running" ? { ...step, status: "failed" } : step,
        ),
      }));
      abortRef.current = null;
      setStatus("idle");
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  return { messages, status, ask, stop, reset };
}

/** The thread as the route takes it: text turns only, skipping answers that never came. */
function toParams(messages: ThreadMessage[]): ThreadMessageParam[] {
  return messages.flatMap((message) =>
    message.content.trim() ? [{ role: message.role, content: message.content }] : [],
  );
}

function upsertStep(steps: ToolStep[], event: Extract<AssistantEvent, { type: "tool" }>) {
  const step: ToolStep = { id: event.id, label: event.label, status: event.status };
  return steps.some((existing) => existing.id === event.id)
    ? steps.map((existing) => (existing.id === event.id ? step : existing))
    : [...steps, step];
}

async function describeResponse(response: Response): Promise<AssistantMessage["error"]> {
  if (response.status === 401 || response.redirected) {
    return { kind: "unavailable", message: "Your session has expired. Sign in again." };
  }
  const body: unknown = await response.json().catch(() => null);
  const message =
    typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `The assistant is unavailable (${response.status}).`;
  return { kind: "unavailable", message };
}

function newId(): string {
  return crypto.randomUUID();
}
