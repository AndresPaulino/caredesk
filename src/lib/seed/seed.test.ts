import { describe, expect, it } from "vitest";

import { ASSESSMENT_KINDS } from "../clinical/assessment-kinds";
import { LAB_PANELS } from "../clinical/lab-tests";
import { DEMO_ACCOUNTS } from "../demo-accounts";

import {
  ROW_BUDGET,
  buildSeed,
  residentsVisibleTo,
  rowCounts,
  rowsVisibleTo,
  scopedResidentIds,
  stableId,
} from "./index";
import { SIMULATED_STAFF_COUNT } from "./organization";
import { ADMINISTRATION_DAYS } from "./records";
import { addDays, atZoned, dateInZone } from "../time";
import { CLINICAL_TABLES } from "./types";
import {
  MEDICATION_CATALOG_CODES,
  NAME_POOLS,
  OBSERVATION_CODES,
  conditionEntry,
  conflictsWithAllergy,
  medicationEntry,
  percentilesFor,
} from "./vocabulary";

const ANCHOR = new Date("2026-09-09T18:00:00Z");

describe("the seed", () => {
  const seed = buildSeed({ anchor: ANCHOR });
  const residentById = new Map(seed.residents.map((resident) => [resident.id, resident]));
  const current = seed.residents.filter((resident) => resident.status === "current");
  const former = seed.residents.filter((resident) => resident.status === "former");

  it("is identical on every run with the same seed and anchor", () => {
    expect(buildSeed({ anchor: ANCHOR })).toEqual(seed);
  });

  it("changes with the seed number but keeps the same ids", () => {
    const other = buildSeed({ seed: 7, anchor: ANCHOR });
    expect(other.residents.map((r) => r.id)).toEqual(seed.residents.map((r) => r.id));
    const names = (rows: typeof seed.residents) =>
      rows.map((r) => `${r.first_name} ${r.last_name}`);
    expect(names(other.residents)).not.toEqual(names(seed.residents));
  });

  it("derives the same id from the same key and different ids from different keys", () => {
    expect(stableId("facility:MDW")).toBe(stableId("facility:MDW"));
    expect(stableId("facility:MDW")).not.toBe(stableId("facility:HBR"));
    expect(stableId("x")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("lands every table within twenty percent of the spec's budget", () => {
    const counts = rowCounts(seed);
    for (const [table, budget] of Object.entries(ROW_BUDGET)) {
      const count = counts[table as keyof typeof counts];
      expect(count, table).toBeGreaterThanOrEqual(budget * 0.8);
      expect(count, table).toBeLessThanOrEqual(budget * 1.2);
    }
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThan(50_000);
    expect(total).toBeLessThan(65_000);
  });

  it("houses about 900 current residents across six facilities and keeps about 100 former ones", () => {
    expect(seed.facilities).toHaveLength(6);
    expect(seed.units).toHaveLength(24);
    expect(seed.rooms).toHaveLength(24 * 30);
    expect(current.length).toBe(900);
    expect(former.length).toBe(100);
    for (const facility of seed.facilities) {
      expect(current.filter((r) => r.facility_id === facility.id)).toHaveLength(150);
    }
  });

  it("puts every current resident in a bed on their unit and frees the beds of former residents", () => {
    const unitById = new Map(seed.units.map((unit) => [unit.id, unit]));
    const roomById = new Map(seed.rooms.map((room) => [room.id, room]));
    const occupancy = new Map<string, number>();
    for (const resident of current) {
      expect(unitById.get(resident.unit_id)?.facility_id).toBe(resident.facility_id);
      expect(roomById.get(resident.room_id!)?.unit_id).toBe(resident.unit_id);
      occupancy.set(resident.room_id!, (occupancy.get(resident.room_id!) ?? 0) + 1);
    }
    for (const [roomId, occupants] of occupancy) {
      expect(occupants).toBeLessThanOrEqual(roomById.get(roomId)!.capacity);
    }
    for (const resident of former) expect(resident.room_id).toBeNull();
    const beds = seed.rooms.reduce((sum, room) => sum + room.capacity, 0);
    expect(current.length / beds).toBeGreaterThan(0.9);
  });

  it("draws generated names from the pools and centers ages in the mid-eighties", () => {
    const female = new Set(NAME_POOLS.female);
    const male = new Set(NAME_POOLS.male);
    const last = new Set(NAME_POOLS.last);
    // Hero residents are authored by name (there is no Doe in the pools).
    const heroIds = new Set(seed.heroes.map((hero) => hero.resident.id));
    const ages: number[] = [];
    for (const resident of seed.residents) {
      if (!heroIds.has(resident.id)) {
        expect((resident.sex === "female" ? female : male).has(resident.first_name)).toBe(true);
        expect(last.has(resident.last_name)).toBe(true);
      }
      ages.push(2026 - Number(resident.date_of_birth.slice(0, 4)));
    }
    ages.sort((a, b) => a - b);
    expect(ages[0]).toBeGreaterThanOrEqual(65);
    expect(ages[Math.floor(ages.length / 2)]).toBeGreaterThanOrEqual(83);
    expect(ages[Math.floor(ages.length / 2)]).toBeLessThanOrEqual(88);
  });

  it("gives every former resident a stay end after admission and every current resident none", () => {
    for (const resident of former) {
      expect(resident.stay_ended_on! > resident.admission_date).toBe(true);
      expect(resident.stay_end_reason).not.toBeNull();
    }
    for (const resident of current) {
      expect(resident.stay_ended_on).toBeNull();
      expect(resident.stay_end_reason).toBeNull();
    }
  });

  it("references a catalog entry from every medication order, condition, and care plan", () => {
    for (const order of seed.medication_orders) {
      expect(MEDICATION_CATALOG_CODES.has(order.code), order.medication).toBe(true);
      expect(order.medication).toBe(medicationEntry(order.code).description);
    }
    for (const condition of seed.conditions) {
      expect(conditionEntry(condition.code).description).toBe(condition.description);
    }
    const labCodes = new Set(LAB_PANELS.flatMap((panel) => panel.tests.map((t) => t.code)));
    for (const result of seed.lab_results) expect(labCodes.has(result.code)).toBe(true);
  });

  it("pairs medication orders with the condition they treat on the same resident", () => {
    const conditionById = new Map(seed.conditions.map((condition) => [condition.id, condition]));
    let paired = 0;
    for (const order of seed.medication_orders) {
      if (!order.condition_id) continue;
      paired += 1;
      expect(conditionById.get(order.condition_id)?.resident_id).toBe(order.resident_id);
    }
    expect(paired / seed.medication_orders.length).toBeGreaterThan(0.5);
  });

  it("never orders a medication a resident is allergic to, except the one authored conflict", () => {
    const substancesByResident = new Map<string, string[]>();
    for (const allergy of seed.allergies) {
      if (!allergy.substance) continue;
      const list = substancesByResident.get(allergy.resident_id) ?? [];
      list.push(allergy.substance);
      substancesByResident.set(allergy.resident_id, list);
    }
    expect(substancesByResident.size).toBeGreaterThan(20);
    const conflicting = seed.medication_orders.filter((order) =>
      (substancesByResident.get(order.resident_id) ?? []).some((substance) =>
        conflictsWithAllergy(order.medication, substance),
      ),
    );
    // The hero resident whose story is the conflict (heroes.ts), and nobody else.
    const hero = seed.heroes.find((candidate) => candidate.key === "allergy-conflict")!;
    expect(conflicting.map((order) => order.resident_id)).toEqual([hero.resident.id]);
    const withReaction = seed.allergies.filter((allergy) => allergy.reaction && allergy.severity);
    expect(withReaction.length / seed.allergies.length).toBeGreaterThan(0.6);
  });

  it("stops every former resident's activity when their stay ended", () => {
    const endOf = (residentId: string) => {
      const resident = residentById.get(residentId)!;
      return resident.status === "former" ? atZoned(resident.stay_ended_on!, 23, 59) : null;
    };
    const timestamps: Array<[keyof typeof seed, string]> = [
      ["administrations", "administered_at"],
      ["vitals", "taken_at"],
      ["assessments", "performed_at"],
      ["lab_results", "resulted_at"],
      ["incidents", "occurred_at"],
      ["progress_notes", "written_at"],
      ["appointments", "scheduled_at"],
    ];
    for (const [table, column] of timestamps) {
      for (const row of seed[table] as Array<Record<string, string>>) {
        const end = endOf(row.resident_id);
        if (end) expect(new Date(row[column]).getTime(), table).toBeLessThanOrEqual(end.getTime());
      }
    }
    for (const order of seed.medication_orders) {
      const resident = residentById.get(order.resident_id)!;
      if (resident.status !== "former") continue;
      expect(order.status).toBe("discontinued");
      expect(order.ended_on! <= resident.stay_ended_on!).toBe(true);
    }
    for (const plan of seed.care_plans) {
      const resident = residentById.get(plan.resident_id)!;
      if (resident.status === "former") expect(plan.status).toBe("completed");
    }
    for (const appointment of seed.appointments) {
      const resident = residentById.get(appointment.resident_id)!;
      if (resident.status === "former") expect(appointment.status).not.toBe("scheduled");
    }
  });

  it("gives every current resident the assessment kinds everyone is expected to have", () => {
    const expected = ASSESSMENT_KINDS.filter((kind) => kind.expectedForEveryone);
    const done = new Set(seed.assessments.map((a) => `${a.resident_id}:${a.kind}`));
    for (const resident of current) {
      for (const kind of expected) expect(done.has(`${resident.id}:${kind.kind}`)).toBe(true);
    }
  });

  it("leaves a plausible share of residents overdue for at least one assessment kind", () => {
    const latest = new Map<string, string>();
    for (const assessment of seed.assessments) {
      const key = `${assessment.resident_id}:${assessment.kind}`;
      const previous = latest.get(key);
      if (!previous || assessment.performed_at > previous) latest.set(key, assessment.performed_at);
    }
    let overdue = 0;
    for (const resident of current) {
      const isOverdue = ASSESSMENT_KINDS.some((kind) => {
        const last = latest.get(`${resident.id}:${kind.kind}`);
        if (!last) return kind.expectedForEveryone;
        return dateInZone(new Date(last)) < addDays(seed.anchorDate, -kind.dueEveryDays);
      });
      if (isOverdue) overdue += 1;
    }
    expect(overdue / current.length).toBeGreaterThan(0.05);
    expect(overdue / current.length).toBeLessThan(0.4);
  });

  it("keeps the bulk of vitals and lab values within the catalog's percentile ranges", () => {
    const systolic = percentilesFor(OBSERVATION_CODES.systolic);
    const within = seed.vitals.filter(
      (v) => v.systolic >= systolic.p05 - 5 && v.systolic <= systolic.p95 + 15,
    );
    expect(within.length / seed.vitals.length).toBeGreaterThan(0.9);
    for (const vitals of seed.vitals) {
      expect(vitals.temperature_f).toBeGreaterThan(94);
      expect(vitals.oxygen_saturation).toBeLessThanOrEqual(100);
    }
    let inRange = 0;
    for (const result of seed.lab_results) {
      const p = percentilesFor(result.code);
      if (result.value >= p.p05 && result.value <= p.p95) inRange += 1;
    }
    expect(inRange / seed.lab_results.length).toBeGreaterThan(0.85);
  });

  it("records administrations only for active orders of current residents in the last three days", () => {
    const orderById = new Map(seed.medication_orders.map((order) => [order.id, order]));
    const windowStart = ANCHOR.getTime() - ADMINISTRATION_DAYS * 24 * 60 * 60 * 1000;
    for (const administration of seed.administrations) {
      const order = orderById.get(administration.medication_order_id)!;
      expect(order.status).toBe("active");
      expect(order.resident_id).toBe(administration.resident_id);
      expect(residentById.get(administration.resident_id)!.status).toBe("current");
      const at = new Date(administration.administered_at).getTime();
      expect(at).toBeGreaterThanOrEqual(windowStart);
      expect(at).toBeLessThanOrEqual(ANCHOR.getTime());
    }
  });

  it("attributes every record to a staff member at the resident's facility", () => {
    const staffById = new Map(seed.staff.map((member) => [member.id, member]));
    const check = (residentId: string, staffId: string) => {
      const facility = residentById.get(residentId)!.facility_id;
      expect(staffById.get(staffId)?.facility_id).toBe(facility);
    };
    for (const row of seed.assessments) check(row.resident_id, row.performed_by);
    for (const row of seed.medication_orders) check(row.resident_id, row.prescribed_by);
    for (const row of seed.vitals) check(row.resident_id, row.taken_by);
    for (const row of seed.progress_notes) check(row.resident_id, row.written_by);
    for (const row of seed.incidents) check(row.resident_id, row.reported_by);
  });

  it("seeds the three demo accounts plus physicians and nurses, ten of them simulated", () => {
    const withAccount = seed.staff.filter((member) => member.account);
    expect(withAccount.map((member) => member.account!.key).sort()).toEqual(
      DEMO_ACCOUNTS.map((account) => account.key).sort(),
    );
    const simulated = seed.staff.filter((member) => member.is_simulated);
    expect(simulated).toHaveLength(SIMULATED_STAFF_COUNT);
    // Spread over every facility, each a nurse with units to act on (ticket 08).
    expect(new Set(simulated.map((member) => member.facility_id)).size).toBe(
      seed.facilities.length,
    );
    for (const member of simulated) {
      expect(member.role).toBe("nurse");
      expect(member.unit_ids.length).toBeGreaterThan(0);
    }
    expect(seed.staff.filter((member) => member.role === "physician")).toHaveLength(12);
    for (const unit of seed.units) {
      expect(seed.staff.some((m) => m.role === "nurse" && m.unit_ids.includes(unit.id))).toBe(true);
    }
  });

  it("scopes each demo account to the residents on their units, and the admin to everyone", () => {
    const byKey = Object.fromEntries(DEMO_ACCOUNTS.map((account) => [account.key, account]));
    const meadows = residentsVisibleTo(seed, byKey["nurse-meadows"]);
    const harbor = residentsVisibleTo(seed, byKey["nurse-harbor"]);
    expect(meadows.length).toBeGreaterThan(70);
    expect(meadows.length).toBeLessThan(100);
    expect(harbor.length).toBeGreaterThan(110);
    expect(harbor.length).toBeLessThan(140);
    expect(residentsVisibleTo(seed, byKey["admin"])).toHaveLength(seed.residents.length);
    expect(meadows.some((resident) => harbor.includes(resident))).toBe(false);

    const ids = scopedResidentIds(seed, byKey["nurse-meadows"]);
    for (const table of CLINICAL_TABLES) {
      const visible = rowsVisibleTo(seed, table, byKey["nurse-meadows"]);
      expect(visible.every((row) => ids.has(row.resident_id))).toBe(true);
      expect(visible.length).toBeLessThan(seed[table].length);
    }
  });
});
