import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS } from "../../src/lib/demo-accounts";
import {
  buildProvisionalSeed,
  RESIDENTS_PER_UNIT,
  ROOMS_PER_UNIT,
  residentsVisibleTo,
  stableId,
} from "./provisional-data";

describe("provisional seed", () => {
  const seed = buildProvisionalSeed();

  it("is identical on every run", () => {
    expect(buildProvisionalSeed()).toEqual(seed);
  });

  it("derives the same id from the same key and different ids from different keys", () => {
    expect(stableId("facility:MDW")).toBe(stableId("facility:MDW"));
    expect(stableId("facility:MDW")).not.toBe(stableId("facility:HBR"));
    expect(stableId("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("builds six facilities with four units and thirty rooms each", () => {
    expect(seed.facilities).toHaveLength(6);
    expect(seed.units).toHaveLength(6 * 4);
    expect(seed.rooms).toHaveLength(6 * 4 * ROOMS_PER_UNIT);
  });

  it("puts every resident in a room on their unit, in their facility", () => {
    const unitById = new Map(seed.units.map((unit) => [unit.id, unit]));
    const roomById = new Map(seed.rooms.map((room) => [room.id, room]));
    for (const resident of seed.residents) {
      expect(unitById.get(resident.unit_id)?.facility_id).toBe(resident.facility_id);
      expect(roomById.get(resident.room_id)?.unit_id).toBe(resident.unit_id);
    }
    const roomIds = seed.residents.map((resident) => resident.room_id);
    expect(new Set(roomIds).size).toBe(roomIds.length);
  });

  it("marks one former resident per facility with a stay end that follows admission", () => {
    for (const facility of seed.facilities) {
      const former = seed.residents.filter(
        (resident) => resident.facility_id === facility.id && resident.status === "former",
      );
      expect(former).toHaveLength(1);
      expect(former[0]!.stay_ended_on! > former[0]!.admission_date).toBe(true);
      expect(former[0]!.stay_end_reason).not.toBeNull();
    }
    for (const resident of seed.residents.filter((resident) => resident.status === "current")) {
      expect(resident.stay_ended_on).toBeNull();
      expect(resident.stay_end_reason).toBeNull();
    }
  });

  it("gives each demo account the residents on their units, and the admin everything", () => {
    const byKey = Object.fromEntries(DEMO_ACCOUNTS.map((account) => [account.key, account]));
    expect(residentsVisibleTo(seed, byKey["nurse-meadows"]!)).toHaveLength(2 * RESIDENTS_PER_UNIT);
    expect(residentsVisibleTo(seed, byKey["nurse-harbor"]!)).toHaveLength(3 * RESIDENTS_PER_UNIT);
    expect(residentsVisibleTo(seed, byKey["admin"]!)).toHaveLength(seed.residents.length);

    const meadows = residentsVisibleTo(seed, byKey["nurse-meadows"]!);
    const harbor = residentsVisibleTo(seed, byKey["nurse-harbor"]!);
    expect(meadows.some((resident) => harbor.includes(resident))).toBe(false);
  });
});
