/**
 * One turn of the assistant over a stand-in for the SDK's tool runner: what reaches the drawer
 * when the model answers across two tool rounds, refuses, runs out of tokens or lookups, or
 * when the API itself fails. The model is never called.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TOOL_NAMES, type AssistantEvent } from "./protocol";
import { MAX_ITERATIONS, MAX_TOKENS, runAssistant } from "./run";
import type { ToolContext } from "./tools";

type FinalMessage = {
  stop_reason: string;
  stop_details?: { type: "refusal"; category: string | null; explanation: string | null };
};

type FakeStream = {
  on: (event: string, listener: (delta: string) => void) => void;
  finalMessage: () => Promise<FinalMessage>;
};

/** A message stream that delivers its text to the `text` listener, then its final message. */
function streamOf(text: string[], final: FinalMessage): FakeStream {
  const listeners: Array<(delta: string) => void> = [];
  return {
    on(event, listener) {
      if (event === "text") listeners.push(listener);
    },
    async finalMessage() {
      for (const delta of text) for (const listener of listeners) listener(delta);
      return final;
    },
  };
}

async function* iterations(...streams: FakeStream[]): AsyncGenerator<FakeStream> {
  for (const stream of streams) yield stream;
}

function failingWith(error: unknown): AsyncIterable<FakeStream> {
  return { [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }) };
}

function fakeClient(runner: AsyncIterable<FakeStream>) {
  const toolRunner = vi.fn(() => runner);
  const client = { beta: { messages: { toolRunner } } } as unknown as Anthropic;
  return { client, toolRunner };
}

const staff = {
  fullName: "Maria Alvarez",
  role: "nurse" as const,
  scopeDescription: "Meadows Unit A and Meadows Unit B at Willowbrook Meadows",
};

async function run(client: Anthropic): Promise<AssistantEvent[]> {
  const events: AssistantEvent[] = [];
  await runAssistant({
    client,
    model: "claude-test",
    supabase: {} as ToolContext["supabase"],
    now: new Date("2026-09-10T16:00:00Z"),
    staff,
    resident: { id: "e8448534-7876-5654-87e7-379be4967688", name: "Harold Doe" },
    messages: [{ role: "user", content: "When was his last podiatry exam?" }],
    emit: (event) => events.push(event),
  });
  return events;
}

const apiError = (status: number, message: string) => ({
  type: "error",
  error: { type: "api_error", message },
});

describe("one turn of the assistant", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams the text of every round, a blank line between rounds, then done", async () => {
    const { client } = fakeClient(
      iterations(
        streamOf(["Let me ", "look."], { stop_reason: "tool_use" }),
        streamOf(["May 2, 2026."], { stop_reason: "end_turn" }),
      ),
    );
    expect(await run(client)).toEqual([
      { type: "text", text: "Let me " },
      { type: "text", text: "look." },
      { type: "text", text: "\n\n" },
      { type: "text", text: "May 2, 2026." },
      { type: "done", stopReason: "end_turn" },
    ]);
  });

  it("hands the runner the configured model, streaming, adaptive thinking at medium effort, the six tools, and the prompt", async () => {
    const { client, toolRunner } = fakeClient(
      iterations(streamOf(["Done."], { stop_reason: "end_turn" })),
    );
    await run(client);

    expect(toolRunner).toHaveBeenCalledTimes(1);
    const [params] = toolRunner.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(params).toMatchObject({
      model: "claude-test",
      stream: true,
      max_tokens: MAX_TOKENS,
      max_iterations: MAX_ITERATIONS,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: "When was his last podiatry exam?" }],
    });
    expect((params.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual([
      ...TOOL_NAMES,
    ]);
    const system = params.system as Array<{ text: string; cache_control?: unknown }>;
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(system[1].text).toContain("Current resident: Harold Doe");
  });

  it("renders a refusal as a clear message, with the explanation when there is one", async () => {
    const refusal = (explanation: string | null) =>
      fakeClient(
        iterations(
          streamOf([], {
            stop_reason: "refusal",
            stop_details: { type: "refusal", category: "general_harms", explanation },
          }),
        ),
      ).client;

    expect(await run(refusal("This request is outside the assistant's policy."))).toEqual([
      {
        type: "error",
        kind: "refusal",
        message:
          "The assistant declined to answer this question: This request is outside the assistant's policy.",
      },
    ]);
    expect(await run(refusal(null))).toEqual([
      {
        type: "error",
        kind: "refusal",
        message: "The assistant declined to answer this question.",
      },
    ]);
  });

  it("says when the answer ran out of tokens or of lookups", async () => {
    const outOfTokens = fakeClient(
      iterations(streamOf(["Harold Doe's last"], { stop_reason: "max_tokens" })),
    ).client;
    expect(await run(outOfTokens)).toEqual([
      { type: "text", text: "Harold Doe's last" },
      { type: "done", stopReason: "max_tokens" },
    ]);

    // The runner stops at max_iterations with the model still asking for a tool.
    const outOfLookups = fakeClient(iterations(streamOf([], { stop_reason: "tool_use" }))).client;
    expect(await run(outOfLookups)).toEqual([{ type: "done", stopReason: "max_iterations" }]);
  });

  it("renders each kind of API failure as a sentence for the thread", async () => {
    const headers = new Headers();
    const cases: Array<[error: unknown, kind: string, message: RegExp]> = [
      [
        new Anthropic.RateLimitError(429, apiError(429, "slow down"), "slow down", headers),
        "unavailable",
        /busy right now/,
      ],
      [
        new Anthropic.AuthenticationError(401, apiError(401, "bad key"), "bad key", headers),
        "unavailable",
        /API key was rejected/,
      ],
      [
        new Anthropic.APIConnectionError({ message: "ECONNRESET" }),
        "unavailable",
        /could not reach/,
      ],
      [
        new Anthropic.InternalServerError(500, apiError(500, "boom"), "boom", headers),
        "unavailable",
        /request failed \(500\)/,
      ],
    ];
    for (const [error, kind, message] of cases) {
      const events = await run(fakeClient(failingWith(error)).client);
      expect(events, String(error)).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "error", kind });
      expect((events[0] as { message: string }).message).toMatch(message);
    }
  });

  it("logs an unexpected failure and still tells the thread, and stays quiet when the caller stopped it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const events = await run(fakeClient(failingWith(new Error("disk on fire"))).client);
    expect(events).toEqual([
      {
        type: "error",
        kind: "failed",
        message: "The assistant ran into a problem and could not finish. Try again.",
      },
    ]);
    expect(log).toHaveBeenCalledOnce();

    const stopped = await run(fakeClient(failingWith(new Anthropic.APIUserAbortError())).client);
    expect(stopped).toEqual([]);
  });
});
