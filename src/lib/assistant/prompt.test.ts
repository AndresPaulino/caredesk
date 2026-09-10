import { describe, expect, it } from "vitest";

import { ASSISTANT_INSTRUCTIONS, buildSystemPrompt } from "./prompt";

const staff = {
  fullName: "Maria Alvarez",
  role: "nurse" as const,
  scopeDescription: "Meadows Unit A and Meadows Unit B at Willowbrook Meadows",
};

// 2026-09-10 at noon Eastern.
const today = new Date("2026-09-10T16:00:00Z");

describe("the assistant's system prompt", () => {
  it("keeps the unchanging instructions first, marked for the prompt cache", () => {
    const [instructions, context] = buildSystemPrompt({ staff, resident: null, today });
    expect(instructions).toEqual({
      type: "text",
      text: ASSISTANT_INSTRUCTIONS,
      cache_control: { type: "ephemeral" },
    });
    expect(context.cache_control).toBeUndefined();
  });

  it("names who is asking, their scope, and the date in the facilities' time zone", () => {
    const [, context] = buildSystemPrompt({ staff, resident: null, today });
    expect(context.text).toContain("Maria Alvarez (nurse)");
    expect(context.text).toContain(staff.scopeDescription);
    expect(context.text).toContain("Thursday, September 10, 2026");
    expect(context.text).toContain("No current resident");
  });

  it("passes the current resident by name and id so pronouns resolve", () => {
    const resident = { id: "2105861a-c1f6-583f-a36f-9f1d9b9d99d5", name: "Harold Doe" };
    const [, context] = buildSystemPrompt({ staff, resident, today });
    expect(context.text).toContain(`Current resident: Harold Doe (id ${resident.id})`);
    expect(context.text).not.toContain("No current resident");
  });

  it("tells the assistant to answer from tools only, ask which resident, and never write", () => {
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/must come from a tool result/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/ask which resident is meant/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/can't find a resident/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/cannot change anything/);
    expect(ASSISTANT_INSTRUCTIONS).toMatch(/Decline anything else/);
  });
});
