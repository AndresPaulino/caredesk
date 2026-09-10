import { describe, expect, it } from "vitest";

import { findAllergyConflicts } from "../clinical/allergy-conflicts";
import { summarizeAssessments } from "../clinical/assessment-summary";
import { DEMO_ACCOUNTS } from "../demo-accounts";

import { HERO_RESIDENTS, heroResidentId, type HeroKey } from "./heroes";
import { buildSeed, residentsVisibleTo, type Seed } from "./index";
import { FACILITIES, UNIT_CODES } from "./organization";
import { GOAL_TEMPLATES } from "./text";
import { addDays, dateInZone, weekday } from "../time";
import { ALLERGY_POOL, carePlansFor, conditionEntry, medicationEntry } from "./vocabulary";

const ANCHOR = new Date("2026-09-09T18:00:00Z");

describe("the hero residents", () => {
  const seed = buildSeed({ anchor: ANCHOR });
  const ago = (days: number) => addDays(seed.anchorDate, -days);
  const byKey = Object.fromEntries(DEMO_ACCOUNTS.map((account) => [account.key, account]));

  const hero = (key: HeroKey) => {
    const seeded = seed.heroes.find((candidate) => candidate.key === key);
    if (!seeded) throw new Error(`No seeded hero ${key}`);
    return seeded.resident;
  };
  const rows = <T extends { resident_id: string }>(table: readonly T[], residentId: string) =>
    table.filter((row) => row.resident_id === residentId);
  const summary = (residentId: string) =>
    summarizeAssessments(rows(seed.assessments, residentId), {
      today: seed.anchorDate,
      residentStatus: "current",
    });
  const performedOn = (row: { performed_at: string }) => dateInZone(new Date(row.performed_at));

  it("are ten, each with a unique key, name, and room, and every code drawn from the vocabulary", () => {
    expect(HERO_RESIDENTS).toHaveLength(10);
    expect(new Set(HERO_RESIDENTS.map((h) => h.key)).size).toBe(10);
    expect(new Set(HERO_RESIDENTS.map((h) => `${h.firstName} ${h.lastName}`)).size).toBe(10);
    const facilityCodes = new Set(FACILITIES.map((facility) => facility.code));
    const unitCodes = new Set<string>(UNIT_CODES);

    for (const definition of HERO_RESIDENTS) {
      expect(facilityCodes.has(definition.facilityCode), definition.key).toBe(true);
      expect(unitCodes.has(definition.unitCode), definition.key).toBe(true);
      expect(definition.roomNumber === null, definition.key).toBe(Boolean(definition.stay));

      const conditionCodes = new Set(definition.conditions.map((condition) => condition.code));
      for (const condition of definition.conditions) {
        expect(() => conditionEntry(condition.code), definition.key).not.toThrow();
      }
      for (const order of definition.medicationOrders) {
        expect(() => medicationEntry(order.code), definition.key).not.toThrow();
        if (order.treats) expect(conditionCodes.has(order.treats), order.code).toBe(true);
      }
      for (const allergy of definition.allergies) {
        const entry = ALLERGY_POOL.find((candidate) => candidate.code === allergy.code);
        expect(entry, allergy.code).toBeDefined();
        expect(
          entry!.reactions.some(
            (reaction) =>
              reaction.description === allergy.reaction && reaction.severity === allergy.severity,
          ),
          `${definition.key}: ${allergy.reaction}`,
        ).toBe(true);
      }
      if (definition.carePlan) {
        const { code, treats, goals } = definition.carePlan;
        expect(conditionCodes.has(treats), definition.key).toBe(true);
        expect(
          carePlansFor(treats).map((plan) => plan.code),
          definition.key,
        ).toContain(code);
        for (const goal of goals) {
          expect(
            GOAL_TEMPLATES[code].some(
              (template) =>
                template.goal === goal.goal && template.intervention === goal.intervention,
            ),
            `${definition.key}: ${goal.goal}`,
          ).toBe(true);
        }
      }
    }
  });

  it("are seeded with their authored identity, room, and admission, under ids that survive a seed change", () => {
    const facilityById = new Map(seed.facilities.map((facility) => [facility.id, facility]));
    const unitById = new Map(seed.units.map((unit) => [unit.id, unit]));
    const roomById = new Map(seed.rooms.map((room) => [room.id, room]));
    expect(seed.heroes.map((seeded) => seeded.key)).toEqual(HERO_RESIDENTS.map((h) => h.key));

    for (const definition of HERO_RESIDENTS) {
      const resident = hero(definition.key);
      expect(resident.id).toBe(heroResidentId(definition.key));
      expect(resident).toMatchObject({
        first_name: definition.firstName,
        last_name: definition.lastName,
        sex: definition.sex,
        date_of_birth: definition.dateOfBirth,
        admission_date: ago(definition.admittedDaysAgo),
        status: definition.stay ? "former" : "current",
        code_status: definition.codeStatus,
        diet: definition.diet,
        mobility: definition.mobility,
      });
      expect(facilityById.get(resident.facility_id)?.code).toBe(definition.facilityCode);
      expect(unitById.get(resident.unit_id)?.code).toBe(definition.unitCode);
      expect(roomById.get(resident.room_id ?? "")?.number ?? null).toBe(definition.roomNumber);
      expect(roomById.get(resident.room_id ?? "")?.unit_id ?? resident.unit_id).toBe(
        resident.unit_id,
      );
      const conditions = rows(seed.conditions, resident.id);
      expect(conditions.map((c) => c.code).sort()).toEqual(
        definition.conditions.map((c) => c.code).sort(),
      );
      expect(rows(seed.allergies, resident.id)).toHaveLength(definition.allergies.length);
      expect(rows(seed.medication_orders, resident.id)).toHaveLength(
        definition.medicationOrders.length,
      );
      expect(rows(seed.family_contacts, resident.id)).toHaveLength(
        definition.familyContacts.length,
      );
    }

    // Heroes keep the same slot in the census: the totals are unchanged.
    expect(seed.residents.filter((r) => r.status === "current")).toHaveLength(900);
    expect(seed.residents.filter((r) => r.status === "former")).toHaveLength(100);

    const other = buildSeed({ seed: 7, anchor: ANCHOR });
    expect(other.heroes.map((seeded) => seeded.resident)).toEqual(
      seed.heroes.map((seeded) => seeded.resident),
    );
  });

  it("include two Mr. Does in different facilities, one visible to each nurse and both to the admin", () => {
    const harold = hero("doe-meadows");
    const walter = hero("doe-harbor");
    expect([harold.last_name, walter.last_name]).toEqual(["Doe", "Doe"]);
    expect([harold.sex, walter.sex]).toEqual(["male", "male"]);
    expect(harold.facility_id).not.toBe(walter.facility_id);

    const ids = (residents: Seed["residents"]) => new Set(residents.map((r) => r.id));
    const meadows = ids(residentsVisibleTo(seed, byKey["nurse-meadows"]));
    const harbor = ids(residentsVisibleTo(seed, byKey["nurse-harbor"]));
    const admin = ids(residentsVisibleTo(seed, byKey["admin"]));
    expect(meadows.has(harold.id)).toBe(true);
    expect(meadows.has(walter.id)).toBe(false);
    expect(harbor.has(walter.id)).toBe(true);
    expect(harbor.has(harold.id)).toBe(false);
    expect(admin.has(harold.id) && admin.has(walter.id)).toBe(true);
    expect(seed.residents.filter((r) => r.last_name === "Doe")).toHaveLength(2);
  });

  it("give the Meadows Doe an overdue podiatry assessment and a physician visit four days ago", () => {
    const entries = summary(hero("doe-meadows").id);
    const podiatry = entries.find((entry) => entry.kind === "podiatry")!;
    expect(podiatry.status).toBe("overdue");
    expect(podiatry.lastDone?.performedOn).toBe(ago(131));
    expect(podiatry.daysUntilDue).toBe(-41);
    const visit = entries.find((entry) => entry.kind === "physician_visit")!;
    expect(visit.status).toBe("up_to_date");
    expect(visit.lastDone?.performedOn).toBe(ago(4));
    expect(
      visit.lastDone && seed.assessments.find((a) => a.id === visit.lastDone!.id)!.findings,
    ).toMatch(/podiatry follow-up is overdue/);
  });

  it("give the Harbor Doe dialysis three mornings a week and a podiatry exam three weeks ago", () => {
    const walter = hero("doe-harbor");
    const podiatry = summary(walter.id).find((entry) => entry.kind === "podiatry")!;
    expect(podiatry.status).toBe("up_to_date");
    expect(podiatry.lastDone?.performedOn).toBe(ago(23));

    const dialysis = rows(seed.appointments, walter.id).filter((a) => a.kind === "dialysis");
    const ahead = dialysis.filter((a) => a.status === "scheduled");
    const behind = dialysis.filter((a) => a.status === "completed");
    expect(ahead.length).toBeGreaterThanOrEqual(5);
    expect(behind.length).toBeGreaterThanOrEqual(5);
    for (const appointment of dialysis) {
      const date = dateInZone(new Date(appointment.scheduled_at));
      expect([1, 3, 5]).toContain(weekday(date));
      expect(date >= ago(14) && date <= addDays(seed.anchorDate, 14)).toBe(true);
    }
    expect(walter.diet).toBe("renal");
  });

  it("give one resident a new order today that conflicts with a documented allergy, and no one else", () => {
    const margaret = hero("allergy-conflict");
    const allergies = rows(seed.allergies, margaret.id);
    const orders = rows(seed.medication_orders, margaret.id);
    const conflicts = findAllergyConflicts(allergies, orders);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].substance).toBe("sulfamethoxazole");
    expect(conflicts[0].severity).toBe("moderate");
    const order = orders.find((candidate) => candidate.id === conflicts[0].orderId)!;
    expect(order.started_on).toBe(seed.anchorDate);
    expect(order.status).toBe("active");
    expect(seed.administrations.filter((a) => a.medication_order_id === order.id)).toEqual([]);
    // A previous antibiotic course shows the recurrent infections are on the record.
    expect(
      orders.some((o) => o.status === "discontinued" && /nitrofurantoin/i.test(o.medication)),
    ).toBe(true);

    const allergiesByResident = new Map<string, typeof seed.allergies>();
    for (const allergy of seed.allergies) {
      allergiesByResident.set(allergy.resident_id, [
        ...(allergiesByResident.get(allergy.resident_id) ?? []),
        allergy,
      ]);
    }
    const residentsWithConflicts = seed.residents.filter(
      (resident) =>
        findAllergyConflicts(
          allergiesByResident.get(resident.id) ?? [],
          rows(seed.medication_orders, resident.id),
        ).length > 0,
    );
    expect(residentsWithConflicts.map((r) => r.id)).toEqual([margaret.id]);
  });

  it("give one resident two falls in the last thirty days and an overdue fall-risk assessment", () => {
    const eugene = hero("falls");
    const incidents = rows(seed.incidents, eugene.id);
    expect(incidents).toHaveLength(2);
    for (const incident of incidents) {
      expect(incident.kind).toBe("fall");
      expect(dateInZone(new Date(incident.occurred_at)) >= ago(30)).toBe(true);
    }
    expect(incidents.filter((incident) => incident.injury_sustained)).toHaveLength(1);
    const fallRisk = summary(eugene.id).find((entry) => entry.kind === "fall_risk")!;
    expect(fallRisk.status).toBe("overdue");
    expect(fallRisk.lastDone?.performedOn).toBe(ago(112));
    const latest = seed.assessments.find((a) => a.id === fallRisk.lastDone!.id)!;
    expect(latest.score).toBe(45);
    expect(latest.findings).toMatch(/high risk/);
  });

  it("give one resident a hospital stay with orders discontinued at transfer and added on return", () => {
    const frank = hero("readmitted");
    const transfer = rows(seed.appointments, frank.id).find((a) => a.kind === "hospital")!;
    expect(transfer.status).toBe("completed");
    expect(dateInZone(new Date(transfer.scheduled_at))).toBe(ago(16));

    const orders = rows(seed.medication_orders, frank.id);
    const stopped = orders.filter((o) => o.status === "discontinued" && o.ended_on === ago(16));
    const started = orders.filter((o) => o.status === "active" && o.started_on === ago(11));
    expect(stopped.length).toBeGreaterThanOrEqual(2);
    expect(started.length).toBeGreaterThanOrEqual(3);
    expect(
      started.some((o) => /furosemide/i.test(o.medication) && o.frequency === "twice_daily"),
    ).toBe(true);

    const visits = rows(seed.assessments, frank.id).filter((a) => a.kind === "physician_visit");
    expect(visits.some((visit) => performedOn(visit) === ago(11))).toBe(true);
    const notes = rows(seed.progress_notes, frank.id).filter((n) => /hospital/i.test(n.body));
    expect(notes.length).toBeGreaterThanOrEqual(2);
  });

  it("give one resident dementia, a daughter as primary contact, and notes about her calls", () => {
    const rose = hero("dementia");
    expect(rows(seed.conditions, rose.id).some((c) => /Alzheimer/.test(c.description))).toBe(true);
    const primary = rows(seed.family_contacts, rose.id).find((contact) => contact.is_primary)!;
    expect(primary.relationship).toBe("daughter");
    expect(primary.notes).toMatch(/calls the unit/i);
    const calls = rows(seed.progress_notes, rose.id).filter(
      (note) => /daughter|teresa/i.test(note.body) && /called/i.test(note.body),
    );
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const note of calls) expect(dateInZone(new Date(note.written_at)) >= ago(30)).toBe(true);
  });

  it("give one resident a weekly wound-check series with shrinking measurements", () => {
    const samuel = hero("wound-series");
    const checks = rows(seed.assessments, samuel.id)
      .filter((a) => a.kind === "wound_check")
      .sort((a, b) => a.performed_at.localeCompare(b.performed_at));
    expect(checks.map(performedOn)).toEqual([29, 22, 15, 8, 1].map(ago));
    const areas = checks.map((check) => {
      const match = /(\d+\.\d) by (\d+\.\d) cm/.exec(check.findings)!;
      return Number(match[1]) * Number(match[2]);
    });
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeLessThan(areas[i - 1]);
    const plan = rows(seed.care_plans, samuel.id)[0];
    expect(plan.description).toMatch(/wound/i);
    expect(rows(seed.care_plan_goals, samuel.id).some((goal) => goal.status === "met")).toBe(true);
  });

  it("give one resident a stay that ended six days ago with the record intact", () => {
    const irene = hero("recently-former");
    expect(irene.status).toBe("former");
    expect(irene.stay_ended_on).toBe(ago(6));
    expect(irene.stay_end_reason).toBe("discharged");
    expect(irene.room_id).toBeNull();
    for (const order of rows(seed.medication_orders, irene.id)) {
      expect(order.status).toBe("discontinued");
      expect(order.ended_on! <= ago(6)).toBe(true);
    }
    expect(rows(seed.appointments, irene.id).every((a) => a.status !== "scheduled")).toBe(true);
    expect(rows(seed.care_plans, irene.id)[0]).toMatchObject({
      status: "completed",
      ended_on: ago(6),
    });
    expect(rows(seed.progress_notes, irene.id).some((n) => /discharged home/i.test(n.body))).toBe(
      true,
    );
    expect(rows(seed.assessments, irene.id).length).toBeGreaterThan(3);
  });

  it("give one resident a weight-loss trend in the weekly weights", () => {
    const clara = hero("weight-loss");
    const weights = rows(seed.vitals, clara.id)
      .filter((set) => set.weight_lb !== null)
      .sort((a, b) => a.taken_at.localeCompare(b.taken_at));
    expect(weights.length).toBeGreaterThanOrEqual(5);
    const first = weights[0].weight_lb!;
    const last = weights[weights.length - 1].weight_lb!;
    expect(first - last).toBeGreaterThanOrEqual(8);
    expect(last).toBeLessThan(130);
    expect(rows(seed.progress_notes, clara.id).some((n) => /dietitian/i.test(n.body))).toBe(true);
  });

  it("give one resident a care plan whose blood-pressure goal came due unmet", () => {
    const vernon = hero("unmet-goal");
    const goals = rows(seed.care_plan_goals, vernon.id);
    const unmet = goals.find((goal) => goal.status === "not_met")!;
    expect(unmet.description).toMatch(/blood pressure/i);
    expect(unmet.target_date! < seed.anchorDate).toBe(true);
    expect(rows(seed.care_plans, vernon.id)[0].status).toBe("active");
    const recent = rows(seed.vitals, vernon.id).filter(
      (set) => dateInZone(new Date(set.taken_at)) >= ago(7),
    );
    const meanSystolic = recent.reduce((sum, set) => sum + set.systolic, 0) / recent.length;
    expect(meanSystolic).toBeGreaterThan(140);
  });
});
