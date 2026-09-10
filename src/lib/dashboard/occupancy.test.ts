import { describe, expect, it } from "vitest";

import { formatOccupancy, groupOccupancy } from "./occupancy";

const rows = [
  {
    unit_id: "u1",
    unit_name: "Unit A",
    facility_id: "f1",
    facility_name: "Willowbrook Meadows",
    beds: 40,
    residents: 38,
  },
  {
    unit_id: "u2",
    unit_name: "Unit B",
    facility_id: "f1",
    facility_name: "Willowbrook Meadows",
    beds: 40,
    residents: 37,
  },
  {
    unit_id: "u3",
    unit_name: "Unit A",
    facility_id: "f2",
    facility_name: "Willowbrook Harbor",
    beds: 40,
    residents: 40,
  },
];

describe("groupOccupancy", () => {
  it("rolls units up to facilities, in the order they arrive", () => {
    expect(groupOccupancy(rows, "facility")).toEqual([
      { id: "f1", label: "Willowbrook Meadows", beds: 80, residents: 75, occupancy: 0.9375 },
      { id: "f2", label: "Willowbrook Harbor", beds: 40, residents: 40, occupancy: 1 },
    ]);
  });

  it("keeps units apart for a nurse", () => {
    expect(groupOccupancy(rows.slice(0, 2), "unit").map((group) => group.label)).toEqual([
      "Unit A",
      "Unit B",
    ]);
  });

  it("treats a unit with no beds as empty rather than dividing by zero", () => {
    expect(groupOccupancy([{ ...rows[0], beds: 0, residents: 0 }], "unit")[0].occupancy).toBe(0);
  });
});

describe("formatOccupancy", () => {
  it("rounds to a whole percent", () => {
    expect(formatOccupancy(0.9375)).toBe("94%");
    expect(formatOccupancy(1)).toBe("100%");
  });
});
