import { describe, expect, it } from "vitest";

import {
  conflictsByAllergy,
  conflictsByOrder,
  conflictsWithAllergy,
  findAllergyConflicts,
} from "./allergy-conflicts";

const penicillin = {
  id: "allergy-penicillin",
  description: "Penicillin V",
  substance: "penicillin",
  severity: "severe" as const,
  reaction: "Anaphylaxis",
};
const shellfish = {
  id: "allergy-shellfish",
  description: "Shellfish",
  substance: null,
  severity: "moderate" as const,
  reaction: "Hives",
};
const order = (id: string, medication: string, status: "active" | "discontinued" = "active") => ({
  id,
  medication,
  status,
});

describe("conflictsWithAllergy", () => {
  it("matches the substance anywhere in the medication name, ignoring case", () => {
    expect(conflictsWithAllergy("Penicillin V Potassium 500 MG Oral Tablet", "penicillin")).toBe(
      true,
    );
    expect(conflictsWithAllergy("Hydrochlorothiazide / lisinopril 12.5 MG", "lisinopril")).toBe(
      true,
    );
    expect(conflictsWithAllergy("Amoxicillin 500 MG Oral Tablet", "penicillin")).toBe(false);
  });
});

describe("findAllergyConflicts", () => {
  it("flags an active order that names a documented medication allergen", () => {
    const conflicts = findAllergyConflicts(
      [shellfish, penicillin],
      [
        order("order-lisinopril", "lisinopril 10 MG Oral Tablet"),
        order("order-penicillin", "Penicillin V Potassium 500 MG Oral Tablet"),
      ],
    );
    expect(conflicts).toEqual([
      {
        allergyId: "allergy-penicillin",
        orderId: "order-penicillin",
        allergy: "Penicillin V",
        substance: "penicillin",
        medication: "Penicillin V Potassium 500 MG Oral Tablet",
        severity: "severe",
        reaction: "Anaphylaxis",
      },
    ]);
  });

  it("ignores discontinued orders, archived rows, and allergies without a substance", () => {
    const conflicts = findAllergyConflicts(
      [
        { ...penicillin, id: "archived", archived_at: "2026-09-01T00:00:00Z" },
        { ...shellfish, description: "Shellfish penicillin", substance: null },
        penicillin,
      ],
      [
        order("stopped", "Penicillin V Potassium 500 MG Oral Tablet", "discontinued"),
        {
          ...order("archived", "Penicillin G 1 MU Injection"),
          archived_at: "2026-09-01T00:00:00Z",
        },
      ],
    );
    expect(conflicts).toEqual([]);
  });

  it("reports every pairing and groups them by order and by allergy", () => {
    const aspirin = {
      ...penicillin,
      id: "allergy-aspirin",
      description: "Aspirin",
      substance: "aspirin",
    };
    const conflicts = findAllergyConflicts(
      [penicillin, aspirin],
      [
        order("order-1", "Aspirin 81 MG Oral Tablet"),
        order("order-2", "Penicillin V Potassium 500 MG Oral Tablet"),
        order("order-3", "Aspirin 325 MG Oral Tablet"),
      ],
    );
    expect(conflicts.map((c) => [c.allergyId, c.orderId])).toEqual([
      ["allergy-penicillin", "order-2"],
      ["allergy-aspirin", "order-1"],
      ["allergy-aspirin", "order-3"],
    ]);
    expect([...conflictsByOrder(conflicts).keys()]).toEqual(["order-2", "order-1", "order-3"]);
    expect(conflictsByAllergy(conflicts).get("allergy-aspirin")).toHaveLength(2);
  });
});
