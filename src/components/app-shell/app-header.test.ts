import { describe, expect, it } from "vitest";

import { crumbsFor } from "./app-header";

describe("crumbsFor", () => {
  it("starts every trail at the dashboard", () => {
    expect(crumbsFor("/")).toEqual([{ href: "/", label: "Dashboard" }]);
  });

  it("labels known segments and names a record by its parent", () => {
    expect(crumbsFor("/residents/3f0d6b3e-1c1b-5a3a-9a8d-0c9a1d2e3f40")).toEqual([
      { href: "/", label: "Dashboard" },
      { href: "/residents", label: "Residents" },
      { href: "/residents/3f0d6b3e-1c1b-5a3a-9a8d-0c9a1d2e3f40", label: "Resident" },
    ]);
  });
});
