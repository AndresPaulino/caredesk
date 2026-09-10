/**
 * The simulator over an in-memory store and a fake clock: who it acts on, what it never
 * does, and how the loop behaves. No live loop, no database.
 */
import { describe, expect, it } from "vitest";

import { VITAL_RANGES, outOfRangeReadings, type VitalReading } from "../clinical/vital-ranges";
import { createRandom } from "../seed/random";
import { CODES } from "../seed/vocabulary";
import { dateInZone, weekday } from "../time";

import {
  EXCURSION_CHANCE,
  MAX_VITAL_STEPS,
  VITAL_BOUNDS,
  VITAL_STEPS,
  dueDoses,
  freeRooms,
  nextVitals,
  planAction,
} from "./actions";
import { createMemoryStore, type MemoryStoreState } from "./memory-store";
import { hourInZone } from "./rhythm";
import { createSimulator, type StepResult } from "./simulator";
import { ACTION_KINDS, type SimulatedNurse, type SimulatedResident } from "./types";

// ---------------------------------------------------------------------------------------------
// Fixtures: one facility, three units, a nurse on two of them
// ---------------------------------------------------------------------------------------------

const FACILITY = { id: "facility-1", name: "Willowbrook Meadows", city: "Concord" };
const UNIT_A = { id: "unit-a", facility_id: FACILITY.id, code: "A", name: "Unit A" };
const UNIT_B = { id: "unit-b", facility_id: FACILITY.id, code: "B", name: "Unit B" };
const UNIT_C = { id: "unit-c", facility_id: FACILITY.id, code: "C", name: "Unit C" };
const ROOMS = [
  { id: "room-101", unit_id: UNIT_A.id, number: "101", capacity: 1 },
  { id: "room-102", unit_id: UNIT_A.id, number: "102", capacity: 2 },
  { id: "room-103", unit_id: UNIT_A.id, number: "103", capacity: 1 },
  { id: "room-201", unit_id: UNIT_B.id, number: "201", capacity: 1 },
  { id: "room-202", unit_id: UNIT_B.id, number: "202", capacity: 1 },
  { id: "room-301", unit_id: UNIT_C.id, number: "301", capacity: 1 },
];

const NURSE: SimulatedNurse = {
  id: "nurse-1",
  first_name: "Nadia",
  last_name: "Roy",
  credentials: "RN",
  facility_id: FACILITY.id,
  unit_ids: [UNIT_A.id, UNIT_B.id],
};

const LISINOPRIL = {
  id: "order-lisinopril",
  medication: "Lisinopril 10 MG Oral Tablet",
  frequency: "once_daily" as const,
  status: "active" as const,
  started_on: "2026-01-05",
};
const METOPROLOL_STOPPED = {
  id: "order-metoprolol",
  medication: "Metoprolol Tartrate 25 MG Oral Tablet",
  frequency: "twice_daily" as const,
  status: "discontinued" as const,
  started_on: "2025-06-01",
};
const ACETAMINOPHEN_PRN = {
  id: "order-acetaminophen",
  medication: "Acetaminophen 325 MG Oral Tablet",
  frequency: "as_needed" as const,
  status: "active" as const,
  started_on: "2026-01-05",
};
const DONEPEZIL = {
  id: "order-donepezil",
  medication: "Donepezil hydrochloride 10 MG Oral Tablet",
  frequency: "twice_daily" as const,
  status: "active" as const,
  started_on: "2025-11-20",
};

const BASELINE_VITALS = {
  systolic: 132,
  diastolic: 78,
  pulse: 71,
  temperature_f: 98.1,
  respiratory_rate: 16,
  oxygen_saturation: 96,
  weight_lb: 158.4,
  taken_at: "2026-09-09T11:40:00.000Z",
};

function resident(overrides: Partial<SimulatedResident> & { id: string }): SimulatedResident {
  return {
    first_name: "Harold",
    last_name: "Blake",
    sex: "male",
    date_of_birth: "1941-03-12",
    admission_date: "2025-02-10",
    status: "current",
    facility_id: FACILITY.id,
    unit_id: UNIT_A.id,
    room_id: null,
    diet: "regular",
    mobility: "walker",
    code_status: "full_code",
    condition_codes: [CODES.hypertension],
    orders: [],
    administrations: [],
    latest_vitals: BASELINE_VITALS,
    ...overrides,
  };
}

const HAROLD = resident({
  id: "resident-harold",
  room_id: "room-101",
  orders: [LISINOPRIL, METOPROLOL_STOPPED, ACETAMINOPHEN_PRN],
});
const EDITH = resident({
  id: "resident-edith",
  first_name: "Edith",
  last_name: "Marsh",
  sex: "female",
  room_id: "room-102",
  condition_codes: [CODES.dementia],
  orders: [DONEPEZIL],
  mobility: "wheelchair",
  diet: "mechanical_soft",
});
/** A former resident of Unit A: active orders left on the record, no bed. */
const WALTER = resident({
  id: "resident-walter-former",
  first_name: "Walter",
  last_name: "Finch",
  status: "former",
  room_id: null,
  orders: [LISINOPRIL],
});
const RUTH = resident({
  id: "resident-ruth",
  first_name: "Ruth",
  last_name: "Adler",
  sex: "female",
  unit_id: UNIT_B.id,
  room_id: "room-201",
  latest_vitals: null,
});
/** On Unit C, which the nurse does not cover, with doses due all day. */
const OSCAR = resident({
  id: "resident-oscar-unit-c",
  first_name: "Oscar",
  last_name: "Lund",
  unit_id: UNIT_C.id,
  room_id: "room-301",
  orders: [DONEPEZIL, LISINOPRIL, ACETAMINOPHEN_PRN],
});

function fixture(
  residents: SimulatedResident[] = [HAROLD, EDITH, WALTER, RUTH, OSCAR],
): MemoryStoreState {
  return { facilities: [FACILITY], units: [UNIT_A, UNIT_B, UNIT_C], rooms: ROOMS, residents };
}

/** 9:30 in the morning, Eastern, on a Thursday. */
const MORNING = new Date("2026-09-10T13:30:00Z");

function fakeClock(start: Date) {
  let now = new Date(start);
  return {
    now: () => now,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    set: (instant: Date) => {
      now = new Date(instant);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Who the simulator acts on
// ---------------------------------------------------------------------------------------------

describe("who a simulated nurse acts on", () => {
  it("only current residents of the units the nurse covers, in the nurse's own name", async () => {
    const store = createMemoryStore(fixture());
    const clock = fakeClock(MORNING);
    const simulator = createSimulator({
      store,
      nurses: [NURSE],
      random: createRandom(1),
      clock: clock.now,
    });
    for (let i = 0; i < 400; i++) {
      await simulator.step();
      // Around the clock, seven minutes at a time.
      clock.advance(7 * 60_000);
    }
    expect(store.writes.length).toBeGreaterThan(350);
    const touched = new Set(store.writes.map((write) => write.action.resident.id));
    expect(touched).toEqual(new Set([HAROLD.id, EDITH.id, RUTH.id]));
    expect(touched.has(WALTER.id)).toBe(false);
    expect(touched.has(OSCAR.id)).toBe(false);
    for (const row of [...store.vitals, ...store.progress_notes, ...store.incidents]) {
      expect(row.actor_id).toBe(NURSE.id);
    }
    for (const write of store.writes) expect(write.nurse).toBe(NURSE);
  });

  it("does nothing at all when the nurse's units hold only former residents", () => {
    const store = createMemoryStore(fixture([WALTER, OSCAR]));
    return store.loadUnits(NURSE.unit_ids, MORNING).then((snapshot) => {
      for (const kind of ACTION_KINDS) {
        expect(planAction(kind, NURSE, snapshot, MORNING, createRandom(1))).toBeNull();
      }
    });
  });

  it("reports an idle round rather than inventing something", async () => {
    const store = createMemoryStore(fixture([WALTER]));
    const simulator = createSimulator({ store, nurses: [NURSE], random: createRandom(1) });
    const result = await simulator.step();
    expect(result.status).toBe("idle");
    expect(simulator.summary()).toMatchObject({ steps: 1, idle: 1, done: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------------------------

describe("giving medications", () => {
  it("never administers a discontinued order, and gives each scheduled dose once", async () => {
    const store = createMemoryStore(fixture());
    const random = createRandom(3);
    const given: string[] = [];
    // The 9 am doses are outstanding at 9:30; the pass works through them and then stops.
    for (let round = 0; round < 25; round++) {
      const snapshot = await store.loadUnits(NURSE.unit_ids, MORNING);
      const action = planAction("administration", NURSE, snapshot, MORNING, random);
      if (!action) break;
      expect(action.kind).toBe("administration");
      if (action.kind !== "administration") throw new Error("unreachable");
      expect(action.order.status).toBe("active");
      expect(action.row.medication_order_id).not.toBe(METOPROLOL_STOPPED.id);
      const result = await store.apply(NURSE, action);
      expect(result.ok).toBe(true);
      given.push(action.row.medication_order_id);
    }
    // Harold's lisinopril, Edith's donepezil, and Harold's as-needed acetaminophen at most once.
    expect(given.filter((id) => id === LISINOPRIL.id)).toHaveLength(1);
    expect(given.filter((id) => id === DONEPEZIL.id)).toHaveLength(1);
    expect(given.filter((id) => id === ACETAMINOPHEN_PRN.id).length).toBeLessThanOrEqual(1);
    expect(given).not.toContain(METOPROLOL_STOPPED.id);
    expect(store.administrations.every((row) => row.resident_id !== OSCAR.id)).toBe(true);
  });

  it("finds nothing to give when every order is discontinued or already given", async () => {
    const onlyStopped = resident({ id: "resident-stopped", orders: [METOPROLOL_STOPPED] });
    const store = createMemoryStore(fixture([onlyStopped]));
    const snapshot = await store.loadUnits(NURSE.unit_ids, MORNING);
    expect(planAction("administration", NURSE, snapshot, MORNING, createRandom(1))).toBeNull();
    expect(dueDoses(onlyStopped, MORNING)).toEqual([]);

    const alreadyGiven = resident({
      id: "resident-given",
      orders: [LISINOPRIL],
      administrations: [
        { medication_order_id: LISINOPRIL.id, administered_at: "2026-09-10T13:05:00.000Z" },
      ],
    });
    expect(dueDoses(alreadyGiven, MORNING)).toEqual([]);
    const fresh = resident({ id: "resident-due", orders: [LISINOPRIL] });
    expect(dueDoses(fresh, MORNING).map((dose) => dose.orderId)).toEqual([LISINOPRIL.id]);
    // At 3 in the afternoon the 9 am dose is a missed dose, not one to give now.
    expect(dueDoses(fresh, new Date("2026-09-10T19:00:00Z"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------------------------

describe("recording vitals", () => {
  const readings = Object.keys(VITAL_RANGES) as VitalReading[];

  it("moves a little from the resident's last set and stays within bounds a resident could have", () => {
    const random = createRandom(4);
    let excursions = 0;
    const sets = 2000;
    for (let i = 0; i < sets; i++) {
      const next = nextVitals(BASELINE_VITALS, MORNING, random);
      for (const reading of readings) {
        const [low, high] = VITAL_BOUNDS[reading];
        expect(next[reading]).toBeGreaterThanOrEqual(low);
        expect(next[reading]).toBeLessThanOrEqual(high);
      }
      expect(next.systolic - next.diastolic).toBeGreaterThanOrEqual(15);
      expect(next.taken_at).toBe(MORNING.toISOString());
      if (next.notes) {
        excursions += 1;
        expect(outOfRangeReadings(next).length).toBeGreaterThan(0);
        continue;
      }
      for (const reading of readings) {
        const tolerance = reading === "temperature_f" ? 0.05 : 0.5;
        expect(Math.abs(next[reading] - BASELINE_VITALS[reading])).toBeLessThanOrEqual(
          MAX_VITAL_STEPS * VITAL_STEPS[reading] + tolerance,
        );
      }
    }
    expect(excursions / sets).toBeGreaterThan(EXCURSION_CHANCE / 2);
    expect(excursions / sets).toBeLessThan(EXCURSION_CHANCE * 2);
  });

  it("starts from typical readings for a resident with no vitals on record, without a weight", () => {
    const random = createRandom(5);
    for (let i = 0; i < 200; i++) {
      const next = nextVitals(null, MORNING, random);
      expect(next.weight_lb).toBeNull();
      if (next.notes) continue;
      expect(next.systolic).toBeGreaterThan(100);
      expect(next.systolic).toBeLessThan(150);
      expect(next.temperature_f).toBeGreaterThan(97);
      expect(next.temperature_f).toBeLessThan(99.5);
    }
  });

  it("weighs on Monday mornings, near the last weight", () => {
    const random = createRandom(6);
    const mondayMorning = new Date("2026-09-14T11:15:00Z");
    expect(weekday(dateInZone(mondayMorning))).toBe(1);
    const next = nextVitals(BASELINE_VITALS, mondayMorning, random);
    expect(next.weight_lb).not.toBeNull();
    expect(Math.abs(next.weight_lb! - BASELINE_VITALS.weight_lb)).toBeLessThan(4);
  });
});

// ---------------------------------------------------------------------------------------------
// Incidents, details, appointments
// ---------------------------------------------------------------------------------------------

describe("the rest of the shift", () => {
  it("reports incidents at a low rate", async () => {
    const store = createMemoryStore(fixture());
    const clock = fakeClock(new Date("2026-09-10T14:00:00Z"));
    const simulator = createSimulator({
      store,
      nurses: [NURSE],
      random: createRandom(7),
      clock: clock.now,
    });
    for (let i = 0; i < 1500; i++) {
      await simulator.step();
      clock.advance(60_000);
    }
    const summary = simulator.summary();
    expect(summary.done).toBe(1500);
    expect(summary.byKind.incident).toBeGreaterThan(0);
    expect(summary.byKind.incident / summary.done).toBeLessThan(0.03);
    for (const incident of store.incidents) {
      expect(Date.parse(incident.occurred_at)).toBeLessThan(clock.now().getTime());
      expect(incident.description.length).toBeGreaterThan(40);
    }
  });

  it("moves residents only into a free bed on the nurse's units, and changes details one step at a time", async () => {
    const store = createMemoryStore(fixture());
    const snapshot = await store.loadUnits(NURSE.unit_ids, MORNING);
    // Not Harold's own room, not Ruth's, not the room on Unit C; the two-bed room has one left.
    expect(freeRooms(NURSE, snapshot, HAROLD).map((room) => room.id)).toEqual([
      "room-102",
      "room-103",
      "room-202",
    ]);

    const random = createRandom(8);
    const before = new Map(store.residents.map((r) => [r.id, { ...r }]));
    let moves = 0;
    for (let i = 0; i < 150; i++) {
      const current = await store.loadUnits(NURSE.unit_ids, MORNING);
      const action = planAction("resident_update", NURSE, current, MORNING, random);
      expect(action?.kind).toBe("resident_update");
      if (action?.kind !== "resident_update") throw new Error("unreachable");
      const was = current.residents.find((r) => r.id === action.resident.id)!;
      if (action.changes.room_id) {
        moves += 1;
        const room = ROOMS.find((candidate) => candidate.id === action.changes.room_id)!;
        expect(NURSE.unit_ids).toContain(room.unit_id);
        expect(action.changes.unit_id).toBe(room.unit_id);
        expect(freeRooms(NURSE, current, was).map((r) => r.id)).toContain(room.id);
        expect(action.before).toEqual({ room_id: was.room_id, unit_id: was.unit_id });
      }
      if (action.changes.mobility) {
        const levels = [
          "independent",
          "cane",
          "walker",
          "wheelchair",
          "one_person_assist",
          "two_person_assist",
          "bedbound",
        ];
        expect(
          Math.abs(levels.indexOf(action.changes.mobility) - levels.indexOf(was.mobility)),
        ).toBe(1);
      }
      if (action.changes.diet) expect(action.changes.diet).not.toBe(was.diet);
      if (action.changes.code_status) expect(action.changes.code_status).not.toBe(was.code_status);
      expect((await store.apply(NURSE, action)).ok).toBe(true);
    }
    expect(moves).toBeGreaterThan(10);
    // Never more residents in a room than it has beds.
    const occupancy = new Map<string, number>();
    for (const r of store.residents) {
      if (r.status === "current" && r.room_id)
        occupancy.set(r.room_id, (occupancy.get(r.room_id) ?? 0) + 1);
    }
    for (const room of ROOMS)
      expect(occupancy.get(room.id) ?? 0).toBeLessThanOrEqual(room.capacity);
    // The former resident and the Unit C resident were left alone.
    expect(store.residents.find((r) => r.id === WALTER.id)).toEqual(before.get(WALTER.id));
    expect(store.residents.find((r) => r.id === OSCAR.id)).toEqual(before.get(OSCAR.id));
  });

  it("schedules appointments on a weekday in office hours, one to three weeks out", async () => {
    const store = createMemoryStore(fixture());
    const snapshot = await store.loadUnits(NURSE.unit_ids, MORNING);
    const random = createRandom(9);
    const locations: string[] = [];
    for (let i = 0; i < 200; i++) {
      const action = planAction("appointment", NURSE, snapshot, MORNING, random);
      if (action?.kind !== "appointment") throw new Error("expected an appointment");
      locations.push(action.row.location);
      const at = new Date(action.row.scheduled_at);
      expect(at.getTime()).toBeGreaterThan(MORNING.getTime());
      expect(at.getTime()).toBeLessThan(MORNING.getTime() + 23 * 24 * 3_600_000);
      expect([1, 2, 3, 4, 5]).toContain(weekday(dateInZone(at)));
      expect(hourInZone(at)).toBeGreaterThanOrEqual(8);
      expect(hourInZone(at)).toBeLessThanOrEqual(15);
      expect(action.row.kind).not.toBe("dialysis");
      expect(action.row.purpose.length).toBeGreaterThan(0);
    }
    // Most appointments are in the facility's own town.
    expect(locations.filter((location) => location.includes("Concord")).length).toBeGreaterThan(
      150,
    );
  });

  it("writes notes for the shift it is, in the resident's own terms", async () => {
    const store = createMemoryStore(fixture([EDITH]));
    const night = new Date("2026-09-10T07:00:00Z");
    const snapshot = await store.loadUnits(NURSE.unit_ids, night);
    const random = createRandom(10);
    const bodies: string[] = [];
    for (let i = 0; i < 30; i++) {
      const action = planAction("note", NURSE, snapshot, night, random);
      if (action?.kind !== "note") throw new Error("expected a note");
      expect(action.row.written_at).toBe(night.toISOString());
      bodies.push(action.row.body);
    }
    expect(bodies.some((body) => body.includes("Mrs. Marsh"))).toBe(true);
    expect(bodies.some((body) => body.includes("Mr. Marsh"))).toBe(false);
    // Night-shift notes, not the day's.
    expect(bodies.some((body) => /overnight|night/i.test(body))).toBe(true);
    expect(bodies.some((body) => /breakfast|lunch/i.test(body))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------------------------

describe("the loop", () => {
  it("counts a rejected write and carries on", async () => {
    const store = createMemoryStore(fixture());
    const seen: StepResult[] = [];
    const simulator = createSimulator({
      store,
      nurses: [NURSE],
      random: createRandom(11),
      clock: () => MORNING,
      onStep: (result) => seen.push(result),
    });
    store.failNext("new row violates row-level security policy");
    const first = await simulator.step();
    expect(first.status).toBe("rejected");
    if (first.status !== "rejected") throw new Error("unreachable");
    expect(first.message).toMatch(/row-level security/);
    expect(first.summary).toMatch(/Harold Blake|Edith Marsh|Ruth Adler/);
    const second = await simulator.step();
    expect(second.status).toBe("done");
    expect(seen).toHaveLength(2);
    expect(simulator.summary()).toMatchObject({ steps: 2, done: 1, rejected: 1, idle: 0 });
  });

  it("runs until the deadline, waiting the paced interval between actions", async () => {
    const store = createMemoryStore(fixture());
    const clock = fakeClock(MORNING);
    const waits: number[] = [];
    const simulator = createSimulator({
      store,
      nurses: [NURSE],
      random: createRandom(12),
      clock: clock.now,
      pace: 10,
      wait: async (ms) => {
        waits.push(ms);
        clock.advance(ms);
      },
    });
    const summary = await simulator.run({ until: new Date(MORNING.getTime() + 10 * 60_000) });
    expect(summary.steps).toBeGreaterThanOrEqual(60);
    expect(summary.steps).toBeLessThanOrEqual(200);
    expect(summary.done).toBe(summary.steps);
    expect(summary.stoppedAt.getTime()).toBe(MORNING.getTime() + 10 * 60_000);
    for (const ms of waits.slice(0, -1)) {
      expect(ms).toBeGreaterThanOrEqual(3_000);
      expect(ms).toBeLessThanOrEqual(9_000);
    }
    expect(waits.at(-1)).toBeLessThanOrEqual(9_000);
  });

  it("stops when the signal fires, even mid-wait", async () => {
    const store = createMemoryStore(fixture());
    const controller = new AbortController();
    const simulator = createSimulator({
      store,
      nurses: [NURSE],
      random: createRandom(13),
      wait: async (ms, signal) => {
        expect(signal).toBe(controller.signal);
        controller.abort();
      },
    });
    const summary = await simulator.run({ signal: controller.signal });
    expect(summary.steps).toBe(1);
  });

  it("counts a round that throws as an error, not a rejection, and tries again later", async () => {
    const store = createMemoryStore(fixture());
    let calls = 0;
    const flaky = {
      ...store,
      loadUnits: async (unitIds: readonly string[], now: Date) => {
        calls += 1;
        if (calls === 1) throw new Error("fetch failed");
        return store.loadUnits(unitIds, now);
      },
    };
    const errors: unknown[] = [];
    const waits: number[] = [];
    const controller = new AbortController();
    const simulator = createSimulator({
      store: flaky,
      nurses: [NURSE],
      random: createRandom(14),
      clock: () => MORNING,
      onError: (error) => errors.push(error),
      wait: async (ms) => {
        waits.push(ms);
        // The first wait follows the error; the second follows a good round.
        if (waits.length === 2) controller.abort();
      },
    });
    await simulator.run({ signal: controller.signal });
    expect(errors).toHaveLength(1);
    expect(waits[0]).toBe(10_000);
    expect(simulator.summary()).toMatchObject({ errors: 1, done: 1, rejected: 0 });
  });

  it("replays the same run from the same seed", async () => {
    const run = async () => {
      const store = createMemoryStore(fixture());
      const clock = fakeClock(MORNING);
      const simulator = createSimulator({
        store,
        nurses: [NURSE],
        random: createRandom(2026),
        clock: clock.now,
      });
      for (let i = 0; i < 60; i++) {
        await simulator.step();
        clock.advance(5 * 60_000);
      }
      return store.writes.map(({ action }) => JSON.stringify(action));
    };
    expect(await run()).toEqual(await run());
  });
});
