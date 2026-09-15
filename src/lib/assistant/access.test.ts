import { describe, expect, it } from "vitest";

import {
  ACCESS_RECORD_LABELS,
  QUESTION_PREVIEW_LENGTH,
  assistantAccessDetailsSchema,
  describeAssistantAccess,
} from "./access";

const threadId = "0d1a3b1e-2c7a-4d5e-9f10-1b2c3d4e5f60";

describe("describing an assistant access event", () => {
  it("reads a question about a resident with the resident's place in the sentence", () => {
    const story = describeAssistantAccess(
      { kind: "question", threadId, question: "When was his last podiatry exam?" },
      true,
    );
    expect(story).toEqual({
      summary: "asked the assistant about the resident: “When was his last podiatry exam?”",
      recordLabel: ACCESS_RECORD_LABELS.question,
      tab: null,
      changes: [
        { column: "question", label: "Question", after: "When was his last podiatry exam?" },
      ],
    });
  });

  it("reads a question about nobody in particular without a place for a name", () => {
    const story = describeAssistantAccess(
      {
        kind: "question",
        threadId,
        question: "Which residents on Unit B have an allergy conflict?",
      },
      false,
    );
    expect(story.summary).toBe(
      "asked the assistant: “Which residents on Unit B have an allergy conflict?”",
    );
    expect(story.summary).not.toContain("the resident");
  });

  it("shortens a long question in the sentence and keeps the whole of it with the event", () => {
    const question = `Could you ${"please ".repeat(40)}tell me about his medications?`;
    const story = describeAssistantAccess({ kind: "question", threadId, question }, true);
    const quoted = story.summary.slice(story.summary.indexOf("“") + 1, -1);
    expect(quoted.length).toBeLessThanOrEqual(QUESTION_PREVIEW_LENGTH);
    expect(quoted.endsWith("…")).toBe(true);
    expect(story.changes[0].after).toBe(question);
  });

  it("reads a lookup as what was read, on the tab that holds it, with the tool and its input", () => {
    const story = describeAssistantAccess(
      {
        kind: "tool_call",
        threadId,
        tool: "get_medication_orders",
        input: { residentId: "e8448534-7876-5654-87e7-379be4967688", status: "all" },
        summary: "read the resident's medication orders",
        tab: "medications",
      },
      true,
    );
    expect(story).toEqual({
      summary: "read the resident's medication orders through the assistant",
      recordLabel: ACCESS_RECORD_LABELS.tool_call,
      tab: "medications",
      changes: [
        { column: "tool", label: "Tool", after: "get_medication_orders" },
        {
          column: "input",
          label: "Input",
          after: "residentId: e8448534-7876-5654-87e7-379be4967688\nstatus: all",
        },
      ],
    });
  });

  it("falls back to a plain sentence for details it does not recognize", () => {
    expect(describeAssistantAccess({ kind: "something_else" }, false)).toEqual({
      summary: "used the assistant",
      recordLabel: ACCESS_RECORD_LABELS.unknown,
      tab: null,
      changes: [],
    });
    expect(describeAssistantAccess(null, false).summary).toBe("used the assistant");
    expect(
      describeAssistantAccess(
        {
          kind: "tool_call",
          threadId,
          tool: "get_vitals",
          input: {},
          summary: "read the resident's vitals",
          tab: "not-a-tab",
        },
        true,
      ).tab,
    ).toBeNull();
  });

  it("only accepts the tools the assistant has", () => {
    expect(
      assistantAccessDetailsSchema.safeParse({
        kind: "tool_call",
        threadId,
        tool: "drop_table",
        input: {},
        summary: "",
        tab: null,
      }).success,
    ).toBe(false);
  });
});
