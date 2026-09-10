import { describe, expect, it } from "vitest";

import { ageOn, formatDate } from "./format";

describe("formatDate", () => {
  it("formats a calendar date without shifting it by time zone", () => {
    expect(formatDate("2026-09-09")).toBe("Sep 9, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("returns malformed input unchanged", () => {
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("ageOn", () => {
  it("counts whole years and respects the birthday", () => {
    const today = new Date("2026-09-09T12:00:00Z");
    expect(ageOn("1940-09-09", today)).toBe(86);
    expect(ageOn("1940-09-10", today)).toBe(85);
    expect(ageOn("1940-12-31", today)).toBe(85);
  });
});
