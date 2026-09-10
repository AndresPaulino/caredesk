/**
 * The population: about 900 current residents filling the beds at 94 percent occupancy and
 * about 100 former residents whose stays ended in the last year. Each resident gets a name
 * from the pools, an age centered in the mid-eighties, a stay, and the conditions that then
 * shape everything else on their record.
 */
import type { Enums } from "../supabase/database.types";

import type { Organization } from "./organization";
import { stableId, type Random } from "./random";
import { pronounsFor, type ResidentContext } from "./text";
import { addDays, atZoned, daysBetween } from "../time";
import type { SeedRow } from "./types";
import {
  CODES,
  CONDITION_RULES,
  EXCLUSIVE_CONDITION_FAMILIES,
  NAME_POOLS,
  conditionEntry,
  type ConditionEntry,
} from "./vocabulary";

export const CURRENT_RESIDENTS_PER_FACILITY = 150;
export const FORMER_RESIDENTS_PER_FACILITY: readonly number[] = [17, 17, 17, 17, 16, 16];

/** Fractures arrive with the resident: onset just before admission, healing over months. */
const FRACTURE_CODES: readonly string[] = [CODES.hipFracture, "65966004", "443165006"];

export type PlannedCondition = {
  id: string;
  entry: ConditionEntry;
  onset: string;
  resolvedOn: string | null;
};

export type ResidentProfile = {
  /** Stable key the resident's ids derive from, e.g. "MDW:A:12". */
  key: string;
  /** This resident's own generator; records for one resident never reshuffle another's. */
  random: Random;
  row: SeedRow<"residents">;
  facility: SeedRow<"facilities">;
  unit: SeedRow<"units">;
  ageYears: number;
  conditions: PlannedCondition[];
  /** The last calendar date anything can happen to this resident: today, or the day the stay ended. */
  activityEndDate: string;
  /** The last instant anything can happen to this resident. */
  activityEnd: Date;
  has(code: string): boolean;
  hasAny(codes: readonly string[]): boolean;
  context: ResidentContext;
};

export function buildResidents(
  random: Random,
  org: Organization,
  anchor: Date,
  anchorDate: string,
): ResidentProfile[] {
  const profiles: ResidentProfile[] = [];

  org.facilities.forEach((facility, facilityIndex) => {
    const units = org.unitsByFacility.get(facility.id)!;
    const currentCounts = split(CURRENT_RESIDENTS_PER_FACILITY, units.length);
    const formerCounts = split(FORMER_RESIDENTS_PER_FACILITY[facilityIndex], units.length);

    units.forEach((unit, unitIndex) => {
      const rooms = org.roomsByUnit.get(unit.id)!;
      const beds = rooms.flatMap((room) => Array.from({ length: room.capacity }, () => room));
      const openBeds = random.derive(`beds:${facility.code}:${unit.code}`).shuffle(beds);
      const namesOnUnit = new Set<string>();
      const common = { facility, unit, anchor, anchorDate, namesOnUnit };

      for (let i = 0; i < currentCounts[unitIndex]; i++) {
        profiles.push(
          buildResident(random, {
            ...common,
            key: `${facility.code}:${unit.code}:${i}`,
            room: openBeds[i],
            former: false,
          }),
        );
      }
      for (let j = 0; j < formerCounts[unitIndex]; j++) {
        profiles.push(
          buildResident(random, {
            ...common,
            key: `${facility.code}:${unit.code}:former:${j}`,
            room: null,
            former: true,
          }),
        );
      }
    });
  });

  return profiles;
}

/** Splits `total` across `parts` as evenly as whole numbers allow, earlier parts first. */
function split(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, index) => base + (index < remainder ? 1 : 0));
}

type ResidentInput = {
  key: string;
  facility: SeedRow<"facilities">;
  unit: SeedRow<"units">;
  room: SeedRow<"rooms"> | null;
  former: boolean;
  anchor: Date;
  anchorDate: string;
  namesOnUnit: Set<string>;
};

function buildResident(masterRandom: Random, input: ResidentInput): ResidentProfile {
  const { key, facility, unit, room, former, anchor, anchorDate, namesOnUnit } = input;
  const random = masterRandom.derive(`resident:${key}`);

  const sex: "female" | "male" = random.chance(0.62) ? "female" : "male";
  let firstName: string;
  let lastName: string;
  do {
    firstName = random.pick(sex === "female" ? NAME_POOLS.female : NAME_POOLS.male);
    lastName = random.pick(NAME_POOLS.last);
  } while (namesOnUnit.has(`${firstName} ${lastName}`));
  namesOnUnit.add(`${firstName} ${lastName}`);

  const ageYears = clamp(Math.round(random.normal(85, 7)), 66, 103);
  const dateOfBirth = birthDateFor(anchorDate, ageYears, random.int(0, 364));

  let admissionDate: string;
  let stayEndedOn: string | null = null;
  let stayEndReason: Enums<"stay_end_reason"> | null = null;
  if (former) {
    stayEndedOn = addDays(anchorDate, -random.int(7, 400));
    admissionDate = addDays(stayEndedOn, -random.int(30, 1800));
    stayEndReason = random.weighted(
      ["deceased", "discharged", "transferred"] as const,
      (reason) => ({ deceased: 50, discharged: 32, transferred: 18 })[reason],
    );
  } else {
    const bucket = random.next();
    const daysAgo =
      bucket < 0.15
        ? random.int(3, 90)
        : bucket < 0.5
          ? random.int(91, 365)
          : bucket < 0.85
            ? random.int(366, 1095)
            : random.int(1096, 2900);
    admissionDate = addDays(anchorDate, -daysAgo);
  }
  const activityEndDate = stayEndedOn ?? anchorDate;
  const activityEnd = stayEndedOn ? atZoned(stayEndedOn, 23, 59) : anchor;

  const conditions = planConditions(random, key, sex, admissionDate, activityEndDate);
  const codes = new Set(conditions.map((condition) => condition.entry.code));
  const has = (code: string) => codes.has(code);
  const hasAny = (candidates: readonly string[]) => candidates.some(has);

  const diet = chooseDiet(random, has);
  const mobility = chooseMobility(random, ageYears, has);
  const codeStatus = chooseCodeStatus(random, ageYears, has, stayEndReason);

  const row: SeedRow<"residents"> = {
    id: stableId(`resident:${key}`),
    facility_id: facility.id,
    unit_id: unit.id,
    room_id: room?.id ?? null,
    first_name: firstName,
    last_name: lastName,
    date_of_birth: dateOfBirth,
    sex,
    admission_date: admissionDate,
    status: former ? "former" : "current",
    stay_ended_on: stayEndedOn,
    stay_end_reason: stayEndReason,
    code_status: codeStatus,
    diet,
    mobility,
  };

  return {
    key,
    random,
    row,
    facility,
    unit,
    ageYears,
    conditions,
    activityEndDate,
    activityEnd,
    has,
    hasAny,
    context: {
      firstName,
      lastName,
      sex,
      ...pronounsFor(sex),
      ageYears,
      mobility,
      diet,
      hasDementia: has(CODES.dementia),
      hasDiabetes: has(CODES.diabetes),
      hasHeartFailure: has(CODES.heartFailure),
      hasCopd: has(CODES.copd),
      hasHypertension: has(CODES.hypertension),
      hasPressureInjury: has(CODES.pressureInjury),
    },
  };
}

/** A date of birth `ageYears` old on `onDate`, `daysBefore` days before the birthday. */
function birthDateFor(onDate: string, ageYears: number, daysBefore: number): string {
  const [year, month, day] = onDate.split("-").map(Number);
  const birthday = new Date(Date.UTC(year - ageYears, month - 1, day)).toISOString().slice(0, 10);
  return addDays(birthday, -daysBefore);
}

function planConditions(
  random: Random,
  key: string,
  sex: "female" | "male",
  admissionDate: string,
  activityEndDate: string,
): PlannedCondition[] {
  const chosen: ConditionEntry[] = [];
  const present = new Set<string>();
  const blocked = new Set<string>();

  for (const rule of CONDITION_RULES) {
    if (rule.sex && rule.sex !== sex) continue;
    if (blocked.has(rule.code)) continue;
    if (rule.requiresAny && !rule.requiresAny.some((code) => present.has(code))) continue;
    if (!random.chance(rule.prevalence)) continue;
    chosen.push(conditionEntry(rule.code));
    present.add(rule.code);
    for (const family of EXCLUSIVE_CONDITION_FAMILIES) {
      if (family.includes(rule.code)) family.forEach((code) => blocked.add(code));
    }
  }

  const stayDays = Math.max(0, daysBetween(admissionDate, activityEndDate));
  return chosen.map((entry) => {
    let onset: string;
    let resolvedOn: string | null = null;
    if (entry.chronic) {
      onset = addDays(activityEndDate, -random.int(365, 15 * 365));
    } else if (FRACTURE_CODES.includes(entry.code)) {
      onset =
        stayDays <= 200
          ? addDays(admissionDate, -random.int(3, 14))
          : addDays(activityEndDate, -random.int(30, 200));
      const healed = addDays(onset, random.int(60, 120));
      resolvedOn = healed <= activityEndDate ? healed : null;
    } else {
      onset = addDays(activityEndDate, -random.int(0, Math.min(150, stayDays)));
      const resolved = addDays(onset, random.int(7, 21));
      resolvedOn = resolved <= activityEndDate ? resolved : null;
    }
    return { id: stableId(`condition:${key}:${entry.code}`), entry, onset, resolvedOn };
  });
}

function chooseDiet(random: Random, has: (code: string) => boolean): Enums<"diet"> {
  if ((has(CODES.endStageRenalDisease) || has(CODES.ckdStage4)) && random.chance(0.8))
    return "renal";
  if (has(CODES.diabetes) && random.chance(0.75)) return "diabetic";
  if (has(CODES.dementia) && random.chance(0.35)) {
    return random.weighted(
      ["mechanical_soft", "pureed", "thickened_liquids"] as const,
      (diet) => ({ mechanical_soft: 50, pureed: 30, thickened_liquids: 20 })[diet],
    );
  }
  if ((has(CODES.heartFailure) || has(CODES.hypertension)) && random.chance(0.35)) return "cardiac";
  if (random.chance(0.08)) return "mechanical_soft";
  return "regular";
}

const MOBILITY_LEVELS = [
  "independent",
  "cane",
  "walker",
  "wheelchair",
  "one_person_assist",
  "two_person_assist",
  "bedbound",
] as const satisfies readonly Enums<"mobility">[];

function chooseMobility(
  random: Random,
  ageYears: number,
  has: (code: string) => boolean,
): Enums<"mobility"> {
  if (has("161622006")) return random.pick(["wheelchair", "one_person_assist"]); // amputation
  if (has(CODES.hipFracture)) return random.pick(["walker", "wheelchair", "one_person_assist"]);
  const weights =
    ageYears < 80
      ? [35, 20, 25, 12, 5, 2, 1]
      : ageYears < 90
        ? [18, 15, 32, 20, 8, 5, 2]
        : [8, 10, 32, 25, 12, 9, 4];
  const shift = has(CODES.dementia) ? 1 : 0;
  return random.weighted(
    MOBILITY_LEVELS,
    (level) => weights[Math.max(0, MOBILITY_LEVELS.indexOf(level) - shift)],
  );
}

function chooseCodeStatus(
  random: Random,
  ageYears: number,
  has: (code: string) => boolean,
  stayEndReason: Enums<"stay_end_reason"> | null,
): Enums<"code_status"> {
  const weights: Record<Enums<"code_status">, number> = ageYears < 80
    ? { full_code: 70, dnr: 18, dnr_dni: 8, comfort_care: 4 }
    : ageYears < 90
      ? { full_code: 55, dnr: 25, dnr_dni: 13, comfort_care: 7 }
      : { full_code: 35, dnr: 32, dnr_dni: 20, comfort_care: 13 };
  if (has(CODES.dementia)) {
    weights.full_code *= 0.6;
    weights.comfort_care *= 1.5;
  }
  if (stayEndReason === "deceased") {
    weights.full_code *= 0.4;
    weights.comfort_care *= 3;
  }
  return random.weighted(
    ["full_code", "dnr", "dnr_dni", "comfort_care"] as const,
    (status) => weights[status],
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
