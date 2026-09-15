import { describe, expect, it } from "vitest";

import {
  MAX_QUESTION_LENGTH,
  THREAD_TITLE_LENGTH,
  assistantRequestSchema,
  createEventParser,
  encodeEvent,
  mergeSources,
  threadTitle,
  type AssistantEvent,
} from "./protocol";

const events: AssistantEvent[] = [
  {
    type: "context",
    thread: { id: "th1", title: "When was Mr. Doe's last podiatry exam?" },
    questionId: "q1",
    answerId: "a1",
    resident: { id: "r1", name: "Harold Doe" },
  },
  { type: "tool", id: "t1", name: "find_residents", status: "running", label: "Searching" },
  { type: "text", text: "Mr. Doe's last podiatry exam\nwas " },
  { type: "done", stopReason: "end_turn" },
];

describe("the assistant's stream protocol", () => {
  it("reassembles events from chunks split anywhere, including mid-line", () => {
    const wire = events.map(encodeEvent).join("");
    const parser = createEventParser();
    const received: AssistantEvent[] = [];
    // Split into single characters: the worst case a fetch body can deliver.
    for (const char of wire) received.push(...parser.push(char));
    received.push(...parser.flush());
    expect(received).toEqual(events);
  });

  it("delivers several events from one chunk and keeps a partial line for the next", () => {
    const parser = createEventParser();
    const [first, second, third] = events.map(encodeEvent);
    const half = Math.floor(third.length / 2);
    expect(parser.push(first + second + third.slice(0, half))).toEqual(events.slice(0, 2));
    expect(parser.push(third.slice(half))).toEqual([events[2]]);
    expect(parser.flush()).toEqual([]);
  });

  it("returns a final event that arrived without a trailing newline on flush", () => {
    const parser = createEventParser();
    expect(parser.push(encodeEvent(events[3]).trimEnd())).toEqual([]);
    expect(parser.flush()).toEqual([events[3]]);
  });

  it("drops a line that is not an event rather than failing the thread", () => {
    const parser = createEventParser();
    expect(parser.push(`not json\n{"no":"type"}\n\n${encodeEvent(events[2])}`)).toEqual([
      events[2],
    ]);
  });
});

describe("the assistant request", () => {
  it("accepts a question, with or without a thread to continue or a current resident", () => {
    const question = "When was Mr. Doe's last podiatry exam?";
    expect(assistantRequestSchema.safeParse({ question }).success).toBe(true);
    expect(
      assistantRequestSchema.safeParse({
        question,
        threadId: "0d1a3b1e-2c7a-4d5e-9f10-1b2c3d4e5f60",
        residentId: "2105861a-c1f6-583f-a36f-9f1d9b9d99d5",
      }).success,
    ).toBe(true);
    expect(assistantRequestSchema.safeParse({ question, threadId: null }).success).toBe(true);
  });

  it("rejects a blank question, a question that is too long, and ids that are not uuids", () => {
    expect(assistantRequestSchema.safeParse({ question: "   " }).success).toBe(false);
    expect(
      assistantRequestSchema.safeParse({ question: "x".repeat(MAX_QUESTION_LENGTH + 1) }).success,
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({ question: "Hi", threadId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({ question: "Hi", residentId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});

describe("sources and titles", () => {
  it("merges sources by resident and tab, keeping first-read order", () => {
    const harold = { residentId: "r1", residentName: "Harold Doe", tab: null };
    const haroldMeds = {
      residentId: "r1",
      residentName: "Harold Doe",
      tab: "medications" as const,
    };
    const walter = { residentId: "r2", residentName: "Walter Doe", tab: "medications" as const };
    expect(mergeSources([harold], [haroldMeds, harold, walter, haroldMeds])).toEqual([
      harold,
      haroldMeds,
      walter,
    ]);
  });

  it("titles a thread by its first question on one line, cut at the title length", () => {
    expect(threadTitle("  When was Mr. Doe's\n last podiatry exam?  ")).toBe(
      "When was Mr. Doe's last podiatry exam?",
    );
    const long = threadTitle("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(THREAD_TITLE_LENGTH);
    expect(long.endsWith("…")).toBe(true);
  });
});
