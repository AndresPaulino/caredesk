import { describe, expect, it } from "vitest";

import { ASSESSMENT_KINDS } from "./assessment-kinds";
import { DUE_SOON_DAYS, latestByKind, summarizeAssessments } from "./assessment-summary";

const TODAY = "2026-09-10";

// Mid-morning Eastern time on the given date, so the calendar date is unambiguous.
const at = (date: string) => `${date}T14:00:00.000Z`;

const byKind = (entries: ReturnType<typeof summarizeAssessments>) =>
  new Map(entries.map((entry) => [entry.kind, entry]));

describe("summarizeAssessments", () => {
  it("lists every kind in catalog order", () => {
    const entries = summarizeAssessments([], { today: TODAY, residentStatus: "current" });
    expect(entries.map((entry) => entry.kind)).toEqual(ASSESSMENT_KINDS.map((kind) => kind.kind));
  });

  it("takes the latest of a kind as last done and adds the due interval for next due", () => {
    const entries = byKind(
      summarizeAssessments(
        [
          { id: "older", kind: "podiatry", performed_at: at("2026-05-01") },
          { id: "latest", kind: "podiatry", performed_at: at("2026-08-01") },
          { id: "middle", kind: "podiatry", performed_at: at("2026-06-15") },
        ],
        { today: TODAY, residentStatus: "current" },
      ),
    );
    const podiatry = entries.get("podiatry")!;
    expect(podiatry.lastDone).toEqual({
      id: "latest",
      performedAt: at("2026-08-01"),
      performedOn: "2026-08-01",
    });
    expect(podiatry.nextDue).toBe("2026-10-30");
    expect(podiatry.daysUntilDue).toBe(50);
    expect(podiatry.status).toBe("up_to_date");
  });

  it("marks a kind overdue once its latest assessment is older than the due interval", () => {
    // A 90-day kind done 100 days ago is 10 days overdue; done 90 days ago it is due today.
    const entries = byKind(
      summarizeAssessments(
        [
          { id: "podiatry", kind: "podiatry", performed_at: at("2026-06-02") },
          { id: "nursing", kind: "nursing_assessment", performed_at: at("2026-06-12") },
          { id: "physician", kind: "physician_visit", performed_at: at("2026-09-01") },
        ],
        { today: TODAY, residentStatus: "current" },
      ),
    );
    expect(entries.get("podiatry")).toMatchObject({
      nextDue: "2026-08-31",
      daysUntilDue: -10,
      status: "overdue",
    });
    expect(entries.get("nursing_assessment")).toMatchObject({
      nextDue: "2026-09-10",
      daysUntilDue: 0,
      status: "due_soon",
    });
    expect(entries.get("physician_visit")).toMatchObject({
      nextDue: "2026-10-31",
      daysUntilDue: 51,
      status: "up_to_date",
    });
  });

  it("calls a kind due soon within the due-soon window and not a day later", () => {
    const soon = summarizeAssessments(
      [{ id: "a", kind: "physician_visit", performed_at: at("2026-07-26") }],
      { today: TODAY, residentStatus: "current" },
    );
    expect(byKind(soon).get("physician_visit")).toMatchObject({
      daysUntilDue: DUE_SOON_DAYS,
      status: "due_soon",
    });
    const later = summarizeAssessments(
      [{ id: "a", kind: "physician_visit", performed_at: at("2026-07-27") }],
      { today: TODAY, residentStatus: "current" },
    );
    expect(byKind(later).get("physician_visit")).toMatchObject({
      daysUntilDue: DUE_SOON_DAYS + 1,
      status: "up_to_date",
    });
  });

  it("treats a missing assessment as overdue only for kinds everyone is expected to have", () => {
    const entries = byKind(summarizeAssessments([], { today: TODAY, residentStatus: "current" }));
    for (const info of ASSESSMENT_KINDS) {
      expect(entries.get(info.kind), info.kind).toMatchObject({
        lastDone: null,
        nextDue: null,
        daysUntilDue: null,
        status: info.expectedForEveryone ? "overdue" : "not_on_record",
      });
    }
  });

  it("ignores archived assessments", () => {
    const entries = byKind(
      summarizeAssessments(
        [
          {
            id: "archived",
            kind: "dental",
            performed_at: at("2026-09-01"),
            archived_at: at("2026-09-02"),
          },
          { id: "kept", kind: "dental", performed_at: at("2025-01-01") },
        ],
        { today: TODAY, residentStatus: "current" },
      ),
    );
    expect(entries.get("dental")).toMatchObject({ lastDone: { id: "kept" }, status: "overdue" });
  });

  it("has nothing due for a former resident but still shows what was last done", () => {
    const entries = byKind(
      summarizeAssessments(
        [{ id: "visit", kind: "physician_visit", performed_at: at("2025-01-01") }],
        { today: TODAY, residentStatus: "former" },
      ),
    );
    expect(entries.get("physician_visit")).toMatchObject({
      lastDone: { id: "visit" },
      nextDue: null,
      status: "not_due",
    });
    expect(entries.get("nursing_assessment")).toMatchObject({ lastDone: null, status: "not_due" });
  });

  it("resolves the calendar date in the facilities' time zone", () => {
    // 11:30 pm Eastern on Sep 1 is 3:30 am UTC on Sep 2; the assessment was done on Sep 1.
    const entries = byKind(
      summarizeAssessments(
        [{ id: "late", kind: "physician_visit", performed_at: "2026-09-02T03:30:00.000Z" }],
        { today: TODAY, residentStatus: "current" },
      ),
    );
    expect(entries.get("physician_visit")!.lastDone?.performedOn).toBe("2026-09-01");
    expect(entries.get("physician_visit")!.nextDue).toBe("2026-10-31");
  });
});

describe("latestByKind", () => {
  it("keeps the newest unarchived assessment of each kind", () => {
    const latest = latestByKind([
      { id: "a", kind: "vision", performed_at: at("2026-01-01") },
      { id: "b", kind: "vision", performed_at: at("2026-03-01") },
      { id: "c", kind: "vision", performed_at: at("2026-06-01"), archived_at: at("2026-06-02") },
      { id: "d", kind: "dental", performed_at: at("2026-02-01") },
    ]);
    expect([...latest.entries()].map(([kind, row]) => [kind, row.id])).toEqual([
      ["vision", "b"],
      ["dental", "d"],
    ]);
  });
});
