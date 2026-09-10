import { describe, expect, it } from "vitest";

import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps a same-site path with its query string", () => {
    expect(safeNextPath("/residents?status=former")).toBe("/residents?status=former");
  });

  it("falls back to the dashboard for anything that could leave the site or loop", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("https://example.com")).toBe("/");
    expect(safeNextPath("//example.com")).toBe("/");
    expect(safeNextPath("/login")).toBe("/");
  });
});
