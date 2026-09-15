import { useCallback, useEffect, useRef, useState } from "react";

import { loadAssistantThread } from "@/lib/assistant/actions";
import {
  createEventParser,
  mergeSources,
  type AssistantEvent,
  type AssistantMessage,
  type AssistantRequest,
  type CurrentResident,
  type ThreadMessage,
  type ToolStep,
  type UserMessage,
} from "@/lib/assistant/protocol";

/**
 * The thread as the drawer shows it, and the ways it changes: `ask` posts a question in the
 * current thread (or starts one) and applies the streamed events to the pending answer as
 * they arrive; `resume` loads a saved thread; `reset` starts an empty one. The server saves
 * every turn, so what is here is what a resumed thread shows again.
 */

export type { AssistantMessage, ThreadMessage, ToolStep, UserMessage };

export type ThreadStatus = "idle" | "streaming" | "loading";

export type ThreadHandle = { id: string; title: string };

export function useAssistantThread() {
  const [thread, setThread] = useState<ThreadHandle | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [status, setStatus] = useState<ThreadStatus>("idle");
  const threadRef = useRef<ThreadHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(async (question: string, resident: CurrentResident | null) => {
    const content = question.trim();
    if (!content || abortRef.current) return;

    let questionId = newId();
    let answerId = newId();
    const userMessage: UserMessage = { id: questionId, role: "user", content, resident };
    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: answerId,
        role: "assistant",
        content: "",
        steps: [],
        sources: [],
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
      const request: AssistantRequest = {
        threadId: threadRef.current?.id ?? null,
        question: content,
        residentId: resident?.id ?? null,
      };
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
          case "context": {
            // Adopt the server's thread and ids so a resumed thread and this one agree.
            const previousQuestionId = questionId;
            const previousAnswerId = answerId;
            questionId = event.questionId;
            answerId = event.answerId;
            setThread(event.thread);
            threadRef.current = event.thread;
            setMessages((current) =>
              current.map((message) => {
                if (message.id === previousQuestionId && message.role === "user") {
                  return { ...message, id: questionId, resident: event.resident };
                }
                if (message.id === previousAnswerId && message.role === "assistant") {
                  return { ...message, id: answerId };
                }
                return message;
              }),
            );
            break;
          }
          case "text":
            update((message) => ({ ...message, content: message.content + event.text }));
            break;
          case "tool":
            update((message) => ({
              ...message,
              steps: upsertStep(message.steps, event),
              sources: event.sources
                ? mergeSources(message.sources, event.sources)
                : message.sources,
            }));
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
    setThread(null);
    threadRef.current = null;
    setMessages([]);
  }, []);

  /** Loads a saved thread in place of the current one. False when it could not be found. */
  const resume = useCallback(async (id: string): Promise<boolean> => {
    abortRef.current?.abort();
    setStatus("loading");
    try {
      const loaded = await loadAssistantThread(id);
      if (!loaded) return false;
      setThread({ id: loaded.id, title: loaded.title });
      threadRef.current = { id: loaded.id, title: loaded.title };
      setMessages(loaded.messages);
      return true;
    } finally {
      setStatus("idle");
    }
  }, []);

  return { thread, messages, status, ask, stop, reset, resume };
}

function upsertStep(steps: ToolStep[], event: Extract<AssistantEvent, { type: "tool" }>) {
  const step: ToolStep = {
    id: event.id,
    name: event.name,
    label: event.label,
    status: event.status,
  };
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
