/**
 * The provisional seed: six facilities with units and rooms, the three demo staff accounts,
 * and a few dozen residents spread across every unit, enough to demonstrate scope.
 *
 * Everything is derived from a fixed seed and a fixed anchor date, so two runs produce the
 * same rows with the same ids. Ticket 03 replaces this with the full generator.
 */
import { createHash } from "node:crypto";

import demographics from "../../data/vocabulary/demographics.json" with { type: "json" };
import { DEMO_ACCOUNTS, type DemoAccount } from "../../src/lib/demo-accounts";

export const SEED_ANCHOR_DATE = "2026-09-09";
export const RESIDENTS_PER_UNIT = 3;
export const ROOMS_PER_UNIT = 30;

export type SeedFacility = { id: string; code: string; name: string; city: string; state: string };
export type SeedUnit = { id: string; facility_id: string; code: string; name: string };
export type SeedRoom = { id: string; unit_id: string; number: string };
export type SeedStaff = {
  id: string;
  account: DemoAccount;
  facility_id: string | null;
  role: "nurse" | "admin";
  first_name: string;
  last_name: string;
  credentials: string | null;
  email: string;
  unit_ids: string[];
};
export type SeedResident = {
  id: string;
  facility_id: string;
  unit_id: string;
  room_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: "female" | "male";
  admission_date: string;
  status: "current" | "former";
  stay_ended_on: string | null;
  stay_end_reason: "discharged" | "transferred" | "deceased" | null;
  code_status: "full_code" | "dnr" | "dnr_dni" | "comfort_care";
  diet:
    | "regular"
    | "cardiac"
    | "diabetic"
    | "renal"
    | "mechanical_soft"
    | "pureed"
    | "thickened_liquids";
  mobility:
    | "independent"
    | "cane"
    | "walker"
    | "wheelchair"
    | "one_person_assist"
    | "two_person_assist"
    | "bedbound";
};

export type ProvisionalSeed = {
  facilities: SeedFacility[];
  units: SeedUnit[];
  rooms: SeedRoom[];
  staff: SeedStaff[];
  residents: SeedResident[];
};

const FACILITIES: Array<Pick<SeedFacility, "code" | "name" | "city">> = [
  { code: "MDW", name: "Willowbrook Meadows", city: "Concord" },
  { code: "HBR", name: "Willowbrook Harbor", city: "Gloucester" },
  { code: "PNS", name: "Willowbrook Pines", city: "Lenox" },
  { code: "ORC", name: "Willowbrook Orchard", city: "Northampton" },
  { code: "CMN", name: "Willowbrook Commons", city: "Worcester" },
  { code: "BAY", name: "Willowbrook Bayview", city: "Falmouth" },
];

const UNIT_CODES = ["A", "B", "C", "D"];

const CODE_STATUSES: SeedResident["code_status"][] = [
  "full_code",
  "full_code",
  "full_code",
  "dnr",
  "dnr_dni",
  "comfort_care",
];
const DIETS: SeedResident["diet"][] = [
  "regular",
  "regular",
  "cardiac",
  "diabetic",
  "renal",
  "mechanical_soft",
  "pureed",
];
const MOBILITIES: SeedResident["mobility"][] = [
  "independent",
  "cane",
  "walker",
  "walker",
  "wheelchair",
  "one_person_assist",
  "two_person_assist",
];
const STAY_END_REASONS: NonNullable<SeedResident["stay_end_reason"]>[] = [
  "discharged",
  "transferred",
  "deceased",
];

/** UUID v5 style id derived from a key, so the same key always yields the same id. */
export function stableId(key: string): string {
  const hash = createHash("sha1").update(`caredesk:${key}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Small deterministic PRNG (mulberry32). */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}

function isoDateDaysBefore(anchor: string, days: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildProvisionalSeed(): ProvisionalSeed {
  const random = createRandom(20260909);

  const facilities: SeedFacility[] = FACILITIES.map((facility) => ({
    id: stableId(`facility:${facility.code}`),
    ...facility,
    state: "MA",
  }));

  const units: SeedUnit[] = [];
  const rooms: SeedRoom[] = [];
  for (const facility of facilities) {
    UNIT_CODES.forEach((code, unitIndex) => {
      const unit: SeedUnit = {
        id: stableId(`unit:${facility.code}:${code}`),
        facility_id: facility.id,
        code,
        name: `Unit ${code}`,
      };
      units.push(unit);
      for (let n = 1; n <= ROOMS_PER_UNIT; n++) {
        const number = String((unitIndex + 1) * 100 + n);
        rooms.push({
          id: stableId(`room:${facility.code}:${code}:${number}`),
          unit_id: unit.id,
          number,
        });
      }
    });
  }

  const unitByFacilityAndCode = new Map(
    units.map((unit) => [`${unit.facility_id}:${unit.code}`, unit]),
  );
  const facilityByCode = new Map(facilities.map((facility) => [facility.code, facility]));

  const staff: SeedStaff[] = DEMO_ACCOUNTS.map((account) => {
    const facility = account.facilityCode ? facilityByCode.get(account.facilityCode) : null;
    if (account.facilityCode && !facility)
      throw new Error(`Unknown facility code ${account.facilityCode}`);
    return {
      id: stableId(`staff:${account.key}`),
      account,
      facility_id: facility?.id ?? null,
      role: account.role,
      first_name: account.firstName,
      last_name: account.lastName,
      credentials: account.credentials,
      email: account.email,
      unit_ids: account.unitCodes.map((code) => {
        const unit = unitByFacilityAndCode.get(`${facility!.id}:${code}`);
        if (!unit) throw new Error(`Unknown unit ${code} at ${account.facilityCode}`);
        return unit.id;
      }),
    };
  });

  const femaleNames = demographics.first_names.F;
  const maleNames = demographics.first_names.M;
  const lastNames = demographics.last_names;

  const residents: SeedResident[] = [];
  for (const facility of facilities) {
    const facilityUnits = units.filter((unit) => unit.facility_id === facility.id);
    // One former resident per facility, always on the first unit, so every account can see
    // that former residents stay searchable.
    let formerAssigned = false;
    for (const unit of facilityUnits) {
      const unitRooms = rooms.filter((room) => room.unit_id === unit.id);
      const usedRooms = new Set<string>();
      for (let i = 0; i < RESIDENTS_PER_UNIT; i++) {
        let room = random.pick(unitRooms);
        while (usedRooms.has(room.id)) room = random.pick(unitRooms);
        usedRooms.add(room.id);

        const sex: SeedResident["sex"] = random.next() < 0.6 ? "female" : "male";
        const firstName = random.pick(sex === "female" ? femaleNames : maleNames);
        const lastName = random.pick(lastNames);
        const ageYears = random.int(72, 98);
        const birthOffsetDays = ageYears * 365 + random.int(0, 364);
        const admissionDaysAgo = random.int(30, 5 * 365);
        const former = !formerAssigned && unit === facilityUnits[0] && i === RESIDENTS_PER_UNIT - 1;
        if (former) formerAssigned = true;
        const stayEndedDaysAgo = former ? random.int(7, Math.min(admissionDaysAgo - 1, 400)) : null;

        residents.push({
          id: stableId(`resident:${facility.code}:${unit.code}:${i}`),
          facility_id: facility.id,
          unit_id: unit.id,
          room_id: room.id,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: isoDateDaysBefore(SEED_ANCHOR_DATE, birthOffsetDays),
          sex,
          admission_date: isoDateDaysBefore(SEED_ANCHOR_DATE, admissionDaysAgo),
          status: former ? "former" : "current",
          stay_ended_on:
            stayEndedDaysAgo === null
              ? null
              : isoDateDaysBefore(SEED_ANCHOR_DATE, stayEndedDaysAgo),
          stay_end_reason: former ? random.pick(STAY_END_REASONS) : null,
          code_status: random.pick(CODE_STATUSES),
          diet: random.pick(DIETS),
          mobility: random.pick(MOBILITIES),
        });
      }
    }
  }

  return { facilities, units, rooms, staff, residents };
}

/** The residents a demo account is allowed to see, by the scope rule, computed from the seed itself. */
export function residentsVisibleTo(seed: ProvisionalSeed, account: DemoAccount): SeedResident[] {
  if (account.role === "admin") return seed.residents;
  const member = seed.staff.find((staff) => staff.account.key === account.key);
  if (!member) throw new Error(`No seeded staff for ${account.key}`);
  const unitIds = new Set(member.unit_ids);
  return seed.residents.filter((resident) => unitIds.has(resident.unit_id));
}
