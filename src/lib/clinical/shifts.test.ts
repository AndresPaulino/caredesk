import { describe, expect, it } from "vitest";

import { SHIFTS, describeShift, shiftAt } from "./shifts";

describe("shiftAt", () => {
  it("covers the day in three shifts, Eastern time", () => {
    expect(SHIFTS.map((shift) => shift.key)).toEqual(["day", "evening", "night"]);

    // 10:00 AM EDT on September 10 is the day shift, 7 AM to 3 PM.
    const day = shiftAt(new Date("2026-09-10T14:00:00Z"));
    expect(day.key).toBe("day");
    expect(day.startsAt.toISOString()).toBe("2026-09-10T11:00:00.000Z");
    expect(day.endsAt.toISOString()).toBe("2026-09-10T19:00:00.000Z");

    // 3:00 PM exactly belongs to the evening shift; 2:59 PM to the day shift.
    expect(shiftAt(new Date("2026-09-10T19:00:00Z")).key).toBe("evening");
    expect(shiftAt(new Date("2026-09-10T18:59:59Z")).key).toBe("day");
  });

  it("finds the night shift that began the evening before", () => {
    // 2:30 AM EDT on September 10.
    const night = shiftAt(new Date("2026-09-10T06:30:00Z"));
    expect(night.key).toBe("night");
    expect(night.startsAt.toISOString()).toBe("2026-09-10T03:00:00.000Z");
    expect(night.endsAt.toISOString()).toBe("2026-09-10T11:00:00.000Z");

    // 11:00 PM starts it; 10:59 PM is still the evening shift.
    expect(shiftAt(new Date("2026-09-10T03:00:00Z")).key).toBe("night");
    expect(shiftAt(new Date("2026-09-10T02:59:00Z")).key).toBe("evening");
  });

  it("keeps wall-clock boundaries across the daylight-saving change", () => {
    // November 1, 2026: clocks go back at 2 AM. 7:00 AM EST is 12:00 UTC.
    const day = shiftAt(new Date("2026-11-01T12:00:00Z"));
    expect(day.key).toBe("day");
    expect(day.startsAt.toISOString()).toBe("2026-11-01T12:00:00.000Z");
    // The night shift that ended there started at 11 PM EDT (03:00 UTC), nine hours earlier.
    const night = shiftAt(new Date("2026-11-01T11:59:00Z"));
    expect(night.key).toBe("night");
    expect(night.startsAt.toISOString()).toBe("2026-11-01T03:00:00.000Z");
    expect(night.endsAt.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });

  it("describes a shift by its wall-clock hours", () => {
    expect(describeShift(shiftAt(new Date("2026-09-10T14:00:00Z")))).toBe(
      "Day shift, 7:00 AM to 3:00 PM",
    );
    expect(describeShift(shiftAt(new Date("2026-09-10T06:30:00Z")))).toBe(
      "Night shift, 11:00 PM to 7:00 AM",
    );
  });
});
