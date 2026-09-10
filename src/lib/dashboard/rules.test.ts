import { describe, expect, it } from "vitest";

import {
  dashboardFlags,
  hadRecentIncident,
  hasOutOfRangeVitals,
  hasUpcomingAppointment,
  isOverdueForAssessment,
  medicationStatus,
  outstandingDoses,
  scheduledDoses,
  type OrderLike,
} from "./rules";

// 10:00 AM EDT on Thursday, September 10, 2026: the day shift.
const AS_OF = new Date("2026-09-10T14:00:00Z");

const NORMAL = {
  systolic: 120,
  diastolic: 76,
  pulse: 72,
  temperature_f: 98.2,
  respiratory_rate: 16,
  oxygen_saturation: 97,
};

const order = (overrides: Partial<OrderLike> = {}): OrderLike => ({
  id: "order-1",
  frequency: "twice_daily",
  status: "active",
  started_on: "2026-01-01",
  ...overrides,
});

describe("isOverdueForAssessment", () => {
  it("is the assessment summary's rule: any kind overdue, or an expected kind never done", () => {
    const today = "2026-09-10";
    // Every expected kind done recently: nothing overdue, even with podiatry never done.
    const recent = ["physician_visit", "nursing_assessment", "fall_risk", "lab_draw"].map(
      (kind, index) => ({
        id: String(index),
        kind: kind as never,
        performed_at: "2026-09-01T14:00:00Z",
      }),
    );
    expect(isOverdueForAssessment(recent, today)).toBe(false);
    // A physician visit 61 days ago is one day past its 60-day interval.
    expect(
      isOverdueForAssessment(
        recent.map((a) =>
          a.kind === "physician_visit" ? { ...a, performed_at: "2026-07-11T14:00:00Z" } : a,
        ),
        today,
      ),
    ).toBe(true);
    // No fall-risk assessment at all: overdue, because everyone is expected to have one.
    expect(
      isOverdueForAssessment(
        recent.filter((a) => a.kind !== "fall_risk"),
        today,
      ),
    ).toBe(true);
  });
});

describe("hasOutOfRangeVitals", () => {
  it("looks at readings from the last 24 hours only", () => {
    const fever = { ...NORMAL, temperature_f: 101.3 };
    expect(hasOutOfRangeVitals([{ ...fever, taken_at: "2026-09-10T11:30:00Z" }], AS_OF)).toBe(true);
    expect(hasOutOfRangeVitals([{ ...NORMAL, taken_at: "2026-09-10T11:30:00Z" }], AS_OF)).toBe(
      false,
    );
    // 24 hours and one minute ago: outside the window.
    expect(hasOutOfRangeVitals([{ ...fever, taken_at: "2026-09-09T13:59:00Z" }], AS_OF)).toBe(
      false,
    );
    // In the future (a clock skew): not counted.
    expect(hasOutOfRangeVitals([{ ...fever, taken_at: "2026-09-10T14:01:00Z" }], AS_OF)).toBe(
      false,
    );
    // Archived readings do not count.
    expect(
      hasOutOfRangeVitals(
        [{ ...fever, taken_at: "2026-09-10T11:30:00Z", archived_at: "2026-09-10T12:00:00Z" }],
        AS_OF,
      ),
    ).toBe(false);
  });
});

describe("hadRecentIncident", () => {
  it("counts incidents in the last seven days", () => {
    expect(hadRecentIncident([{ occurred_at: "2026-09-04T00:00:00Z" }], AS_OF)).toBe(true);
    expect(hadRecentIncident([{ occurred_at: "2026-09-03T13:59:00Z" }], AS_OF)).toBe(false);
    expect(hadRecentIncident([{ occurred_at: "2026-09-03T14:01:00Z" }], AS_OF)).toBe(true);
  });
});

describe("hasUpcomingAppointment", () => {
  it("counts scheduled appointments on today's and tomorrow's Eastern dates", () => {
    const at = (iso: string, status = "scheduled" as const) => ({ scheduled_at: iso, status });
    // 11:30 PM EDT on the 11th is still tomorrow; 12:30 AM EDT on the 12th is not.
    expect(hasUpcomingAppointment([at("2026-09-12T03:30:00Z")], AS_OF)).toBe(true);
    expect(hasUpcomingAppointment([at("2026-09-12T04:30:00Z")], AS_OF)).toBe(false);
    // Earlier today counts: it is today's appointment whether or not the van has left.
    expect(hasUpcomingAppointment([at("2026-09-10T12:00:00Z")], AS_OF)).toBe(true);
    // Yesterday does not, and neither does a cancelled or completed one.
    expect(hasUpcomingAppointment([at("2026-09-10T03:00:00Z")], AS_OF)).toBe(false);
    expect(
      hasUpcomingAppointment(
        [{ scheduled_at: "2026-09-11T12:00:00Z", status: "cancelled" }],
        AS_OF,
      ),
    ).toBe(false);
  });
});

describe("scheduledDoses", () => {
  it("places each frequency's standard times on today and yesterday", () => {
    const doses = scheduledDoses([order({ frequency: "three_times_daily" })], AS_OF);
    expect(doses.map((dose) => dose.dueAt.toISOString())).toEqual([
      "2026-09-09T13:00:00.000Z",
      "2026-09-09T17:00:00.000Z",
      "2026-09-10T01:00:00.000Z",
      "2026-09-10T13:00:00.000Z",
      "2026-09-10T17:00:00.000Z",
      "2026-09-11T01:00:00.000Z",
    ]);
  });

  it("gives weekly medications on Monday only and as-needed ones never", () => {
    // Monday, September 7, 2026, 10 AM EDT: Monday's dose and nothing on Sunday.
    const monday = new Date("2026-09-07T14:00:00Z");
    expect(scheduledDoses([order({ frequency: "weekly" })], monday)).toHaveLength(1);
    expect(scheduledDoses([order({ frequency: "weekly" })], AS_OF)).toHaveLength(0);
    expect(scheduledDoses([order({ frequency: "as_needed" })], AS_OF)).toHaveLength(0);
  });

  it("skips discontinued and archived orders and days before the order started", () => {
    expect(scheduledDoses([order({ status: "discontinued" })], AS_OF)).toHaveLength(0);
    expect(scheduledDoses([order({ archived_at: "2026-09-01T00:00:00Z" })], AS_OF)).toHaveLength(0);
    // Started today: today's doses only.
    expect(scheduledDoses([order({ started_on: "2026-09-10" })], AS_OF)).toHaveLength(2);
  });
});

describe("outstandingDoses", () => {
  it("matches an administration within two hours of the dose, whatever its status", () => {
    const doses = scheduledDoses([order()], AS_OF);
    const nine = "2026-09-10T13:00:00.000Z";
    const given = (iso: string) => ({ medication_order_id: "order-1", administered_at: iso });
    expect(
      outstandingDoses(doses, [given("2026-09-10T13:20:00Z")]).map((d) => d.dueAt.toISOString()),
    ).not.toContain(nine);
    expect(
      outstandingDoses(doses, [given("2026-09-10T11:00:00Z")]).map((d) => d.dueAt.toISOString()),
    ).not.toContain(nine);
    expect(
      outstandingDoses(doses, [given("2026-09-10T10:59:00Z")]).map((d) => d.dueAt.toISOString()),
    ).toContain(nine);
    // Another order's administration does not count, nor an archived one.
    expect(
      outstandingDoses(doses, [
        { medication_order_id: "order-2", administered_at: "2026-09-10T13:20:00Z" },
      ]).map((d) => d.dueAt.toISOString()),
    ).toContain(nine);
    expect(
      outstandingDoses(doses, [
        { ...given("2026-09-10T13:20:00Z"), archived_at: "2026-09-10T13:30:00Z" },
      ]).map((d) => d.dueAt.toISOString()),
    ).toContain(nine);
  });
});

describe("medicationStatus", () => {
  const twiceDaily = [order()];
  const given = (iso: string) => ({ medication_order_id: "order-1", administered_at: iso });
  /** Yesterday's 9 AM and 9 PM doses, recorded on time. */
  const yesterday = [given("2026-09-09T13:05:00Z"), given("2026-09-10T01:05:00Z")];

  it("is due when an outstanding dose falls in the current shift, past or to come", () => {
    // 10 AM, day shift: the 9 AM dose is outstanding, so due; exactly an hour past is not yet
    // more than an hour past, so not overdue.
    expect(medicationStatus(twiceDaily, yesterday, AS_OF)).toEqual({ due: true, overdue: false });
    // Given at 9:10: nothing left in the day shift; the 9 PM dose is the evening shift's.
    expect(
      medicationStatus(twiceDaily, [...yesterday, given("2026-09-10T13:10:00Z")], AS_OF),
    ).toEqual({ due: false, overdue: false });
  });

  it("gives an hour of grace before a dose is overdue", () => {
    // 9:59 AM: the 9 AM dose is due, not yet overdue.
    const nearlyTen = new Date("2026-09-10T13:59:00Z");
    expect(medicationStatus(twiceDaily, yesterday, nearlyTen)).toEqual({
      due: true,
      overdue: false,
    });
    // 10:01 AM: overdue.
    const pastTen = new Date("2026-09-10T14:01:00Z");
    expect(medicationStatus(twiceDaily, yesterday, pastTen)).toEqual({ due: true, overdue: true });
  });

  it("reports yesterday's missed dose as overdue on the next shift, but not for more than a day", () => {
    // 2 AM, night shift: nothing scheduled in the shift, but last night's 9 PM dose is missed.
    const twoAm = new Date("2026-09-10T06:00:00Z");
    const administrations = [given("2026-09-09T13:05:00Z")];
    expect(medicationStatus(twiceDaily, administrations, twoAm)).toEqual({
      due: false,
      overdue: true,
    });
    // At 2 AM the day after, that dose is more than 24 hours old and no longer reported.
    const nextNight = new Date("2026-09-11T06:00:00Z");
    expect(
      medicationStatus(
        twiceDaily,
        [...administrations, given("2026-09-10T13:05:00Z"), given("2026-09-11T01:05:00Z")],
        nextNight,
      ),
    ).toEqual({ due: false, overdue: false });
  });

  it("ignores as-needed orders", () => {
    expect(medicationStatus([order({ frequency: "as_needed" })], [], AS_OF)).toEqual({
      due: false,
      overdue: false,
    });
  });
});

describe("dashboardFlags", () => {
  it("combines the rules into the flags the database function computes", () => {
    const flags = dashboardFlags(
      {
        assessments: [],
        vitals: [{ ...NORMAL, oxygen_saturation: 86, taken_at: "2026-09-10T11:40:00Z" }],
        incidents: [],
        appointments: [{ scheduled_at: "2026-09-11T14:00:00Z", status: "scheduled" }],
        medication_orders: [order()],
        administrations: [
          "2026-09-09T13:05:00Z",
          "2026-09-10T01:05:00Z",
          "2026-09-10T13:05:00Z",
        ].map((administered_at) => ({ medication_order_id: "order-1", administered_at })),
      },
      AS_OF,
    );
    expect(flags).toEqual({
      overdue_assessment: true,
      out_of_range_vitals: true,
      recent_incident: false,
      upcoming_appointment: true,
      medication_due: false,
      medication_overdue: false,
    });
  });
});
