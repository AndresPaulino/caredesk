import { describe, expect, it } from "vitest";

import { mergeFeedEntries, splitSummary, toFeedEntry, type FeedEntry } from "./feed";

const entry = (id: string, occurredAt: string): FeedEntry => ({
  id,
  occurredAt,
  actor: "Maria Alvarez, RN",
  summary: "recorded vitals",
  kind: "added",
  recordLabel: "Vitals",
  resident: { id: "r1", name: "Jacques Olson" },
  href: "/residents/r1?tab=vitals",
});

describe("toFeedEntry", () => {
  it("keeps the headline and links to the record's tab", () => {
    expect(
      toFeedEntry({
        id: "e1",
        occurred_at: "2026-09-10T14:00:00Z",
        resident_id: "r1",
        actor: { id: "s1", first_name: "Maria", last_name: "Alvarez", credentials: "RN" },
        resident: { id: "r1", first_name: "Jacques", last_name: "Olson" },
        story: {
          summary: "recorded vitals",
          kind: "added",
          recordLabel: "Vitals",
          tab: "vitals",
          changes: [],
        },
      }),
    ).toEqual(entry("e1", "2026-09-10T14:00:00Z"));
  });

  it("leaves the actor and resident unnamed when the reader may not see them", () => {
    const made = toFeedEntry({
      id: "e1",
      occurred_at: "2026-09-10T14:00:00Z",
      resident_id: "r1",
      actor: null,
      resident: null,
      story: {
        summary: "admitted the resident",
        kind: "added",
        recordLabel: "Resident",
        tab: null,
        changes: [],
      },
    });
    expect(made.actor).toBeNull();
    expect(made.resident).toBeNull();
    expect(made.href).toBe("/residents/r1");
  });
});

describe("splitSummary", () => {
  it("puts the name where the story says 'the resident', or after the record", () => {
    expect(splitSummary("moved the resident to Room 214")).toEqual({
      before: "moved ",
      after: " to Room 214",
    });
    expect(splitSummary("changed the resident's diet from Regular to Renal")).toEqual({
      before: "changed ",
      after: "'s diet from Regular to Renal",
    });
    expect(splitSummary("recorded vitals")).toEqual({ before: "recorded vitals for ", after: "" });
  });
});

describe("mergeFeedEntries", () => {
  it("prepends new entries, drops duplicates, and keeps the newest within the limit", () => {
    const current = [entry("b", "2026-09-10T14:00:00Z"), entry("a", "2026-09-10T13:00:00Z")];
    const merged = mergeFeedEntries(
      current,
      [entry("c", "2026-09-10T15:00:00Z"), entry("b", "2026-09-10T14:00:00Z")],
      2,
    );
    expect(merged.map((item) => item.id)).toEqual(["c", "b"]);
  });

  it("orders events at the same instant by id, so the order is stable", () => {
    const merged = mergeFeedEntries(
      [entry("a", "2026-09-10T14:00:00Z")],
      [entry("b", "2026-09-10T14:00:00Z")],
    );
    expect(merged.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
