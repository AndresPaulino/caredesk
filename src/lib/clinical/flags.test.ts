import { describe, expect, it } from "vitest";

import { residentFlags, type FlagInputs } from "./flags";

const now = new Date("2026-09-23T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const none: FlagInputs = {
  codeStatus: "full_code",
  allergies: [],
  fallRiskAssessments: [],
  incidents: [],
};

const keys = (inputs: Partial<FlagInputs>) =>
  residentFlags({ ...none, ...inputs }, now).map((flag) => flag.key);

describe("residentFlags", () => {
  it("flags nothing for a full-code resident with no allergies and no fall history", () => {
    expect(keys({})).toEqual([]);
  });

  it("flags every code status other than full code, labelled with the status", () => {
    for (const codeStatus of ["dnr", "dnr_dni", "comfort_care"] as const) {
      expect(keys({ codeStatus })).toEqual(["dnr"]);
    }
    expect(residentFlags({ ...none, codeStatus: "dnr_dni" }, now)[0].label).toBe("DNR/DNI");
  });

  it("names a single allergy and counts several, ignoring archived ones", () => {
    const one = residentFlags({ ...none, allergies: [{ description: "Penicillin V" }] }, now);
    expect(one[0]).toMatchObject({ key: "allergy", label: "Allergy: Penicillin V" });

    const two = residentFlags(
      {
        ...none,
        allergies: [
          { description: "Penicillin V" },
          { description: "Shellfish" },
          { description: "Latex", archived_at: daysAgo(1) },
        ],
      },
      now,
    );
    expect(two[0]).toMatchObject({
      label: "Allergies",
      detail: "Allergies: Penicillin V, Shellfish",
    });

    expect(keys({ allergies: [{ description: "Latex", archived_at: daysAgo(1) }] })).toEqual([]);
  });

  it("flags fall risk from the latest Morse score of 45 or more", () => {
    expect(keys({ fallRiskAssessments: [{ performed_at: daysAgo(10), score: 45 }] })).toEqual([
      "fall-risk",
    ]);
    expect(keys({ fallRiskAssessments: [{ performed_at: daysAgo(10), score: 40 }] })).toEqual([]);
    // An older high score no longer counts once a newer assessment scores low.
    expect(
      keys({
        fallRiskAssessments: [
          { performed_at: daysAgo(100), score: 70 },
          { performed_at: daysAgo(5), score: 25 },
        ],
      }),
    ).toEqual([]);
  });

  it("flags fall risk after a fall in the last 30 days, whatever the score", () => {
    const fall = (days: number) => ({ kind: "fall" as const, occurred_at: daysAgo(days) });
    expect(
      keys({
        incidents: [fall(9)],
        fallRiskAssessments: [{ performed_at: daysAgo(2), score: 10 }],
      }),
    ).toEqual(["fall-risk"]);
    expect(keys({ incidents: [fall(31)] })).toEqual([]);
    expect(keys({ incidents: [{ kind: "medication_error", occurred_at: daysAgo(2) }] })).toEqual(
      [],
    );
    expect(residentFlags({ ...none, incidents: [fall(9), fall(23)] }, now)[0].detail).toBe(
      "2 falls in the last 30 days",
    );
  });
});
