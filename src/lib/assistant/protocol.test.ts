import { describe, expect, it } from "vitest";

import {
  assistantRequestSchema,
  createEventParser,
  encodeEvent,
  type AssistantEvent,
} from "./protocol";

const events: AssistantEvent[] = [
  { type: "context", resident: { id: "r1", name: "Harold Doe" } },
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
  it("accepts a thread ending in a question, with or without a current resident", () => {
    const messages = [
      { role: "user", content: "When was Mr. Doe's last podiatry exam?" },
      { role: "assistant", content: "Which Mr. Doe?" },
      { role: "user", content: "The one at Meadows" },
    ];
    expect(assistantRequestSchema.safeParse({ messages }).success).toBe(true);
    expect(
      assistantRequestSchema.safeParse({
        messages,
        residentId: "2105861a-c1f6-583f-a36f-9f1d9b9d99d5",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty thread, a thread ending in an answer, and a blank question", () => {
    expect(assistantRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(
      assistantRequestSchema.safeParse({
        messages: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
      }).success,
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({ messages: [{ role: "user", content: "   " }] }).success,
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({
        messages: [{ role: "user", content: "Hi" }],
        residentId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
