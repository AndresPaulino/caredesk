/**
 * Plausibility and planning: given a nurse, what they see of their units, and the time, plan
 * one action of a kind, or none when nothing of that kind is plausible right now. The rules:
 *
 *   - a nurse acts only on current residents of the units they cover;
 *   - a medication is given only against an active order, and only for a scheduled dose that
 *     is outstanding around now (or an as-needed order not given lately);
 *   - a set of vitals moves a little from the resident's last set, stays within bounds a
 *     resident could have, and now and then is the excursion the dashboard exists to show;
 *   - incidents come at a low rate, weighted by fall risk;
 *   - a room move goes to a free bed on the nurse's units, and details change one step at a time.
 *
 * Text comes from the seed's templates, so a simulated note reads like a seeded one.
 */
import { shiftAt } from "../clinical/shifts";
import { VITAL_RANGES, type VitalReading, type VitalValues } from "../clinical/vital-ranges";
import { outstandingDoses, scheduledDoses, type ScheduledDose } from "../dashboard/rules";
import { ageOn, formatMonthDay } from "../format";
import {
  appointmentDetails,
  incidentDescription,
  progressNote,
  pronounsFor,
  type ResidentContext,
} from "../seed/text";
import { CODES } from "../seed/vocabulary";
import { addDays, addMinutes, atZoned, dateInZone, toIso, weekday } from "../time";

import { hourInZone } from "./rhythm";
import type {
  ActionKind,
  LatestVitals,
  PlannedAction,
  ResidentChanges,
  SimulatedNurse,
  SimulatedOrder,
  SimulatedResident,
  SimulatedRoom,
  UnitSnapshot,
  VitalsRecord,
} from "./types";

import type { Random } from "../seed/random";
import type { Enums } from "../supabase/database.types";

const HOUR = 3_600_000;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round1 = (value: number) => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Who a nurse may act on
// ---------------------------------------------------------------------------------------------

/** The residents a nurse may record for: current, and on a unit the nurse covers. */
export function eligibleResidents(
  nurse: SimulatedNurse,
  snapshot: UnitSnapshot,
): SimulatedResident[] {
  return snapshot.residents.filter(
    (resident) => resident.status === "current" && nurse.unit_ids.includes(resident.unit_id),
  );
}

export function residentContext(resident: SimulatedResident, now: Date): ResidentContext {
  const has = (code: string) => resident.condition_codes.includes(code);
  return {
    firstName: resident.first_name,
    lastName: resident.last_name,
    sex: resident.sex,
    ...pronounsFor(resident.sex),
    ageYears: ageOn(resident.date_of_birth, now),
    mobility: resident.mobility,
    diet: resident.diet,
    hasDementia: has(CODES.dementia),
    hasDiabetes: has(CODES.diabetes),
    hasHeartFailure: has(CODES.heartFailure),
    hasCopd: has(CODES.copd),
    hasHypertension: has(CODES.hypertension),
    hasPressureInjury: has(CODES.pressureInjury),
  };
}

export function planAction(
  kind: ActionKind,
  nurse: SimulatedNurse,
  snapshot: UnitSnapshot,
  now: Date,
  random: Random,
): PlannedAction | null {
  const residents = eligibleResidents(nurse, snapshot);
  if (residents.length === 0) return null;
  switch (kind) {
    case "vitals":
      return planVitals(residents, now, random);
    case "administration":
      return planAdministration(residents, now, random);
    case "note":
      return planNote(residents, now, random);
    case "incident":
      return planIncident(residents, now, random);
    case "resident_update":
      return planResidentUpdate(nurse, snapshot, residents, random);
    case "appointment":
      return planAppointment(snapshot, residents, now, random);
  }
}

// ---------------------------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------------------------

export const VITAL_READINGS = Object.keys(VITAL_RANGES) as VitalReading[];

/** How far a reading typically moves from one set to the next (one standard deviation). */
export const VITAL_STEPS: Readonly<Record<VitalReading, number>> = {
  systolic: 6,
  diastolic: 4,
  pulse: 4,
  temperature_f: 0.25,
  respiratory_rate: 1.2,
  oxygen_saturation: 1,
};

/** A reading never moves more than this many steps between sets, excursions aside. */
export const MAX_VITAL_STEPS = 2.5;

/** The widest readings a resident in a care home could plausibly have. */
export const VITAL_BOUNDS: Readonly<Record<VitalReading, readonly [low: number, high: number]>> = {
  systolic: [85, 200],
  diastolic: [45, 110],
  pulse: [42, 140],
  temperature_f: [95.5, 103.5],
  respiratory_rate: [8, 32],
  oxygen_saturation: [82, 100],
};

/** Where readings settle over time, for a resident with no vitals on record yet. */
export const TYPICAL_VITALS: VitalValues = {
  systolic: 126,
  diastolic: 74,
  pulse: 74,
  temperature_f: 98.1,
  respiratory_rate: 16,
  oxygen_saturation: 96,
};

/** The share of sets that are an excursion: a fever, a pressure drop, and the like. */
export const EXCURSION_CHANCE = 0.04;
/** How much of the gap to the typical value closes per set, so readings do not wander off. */
const REVERSION = 0.1;
/** Systolic stays at least this far above diastolic. */
const MIN_PULSE_PRESSURE = 15;
const WEIGHT_BOUNDS: readonly [number, number] = [70, 400];

/** Whether vitals older than this make a resident the first choice for a new set. */
const STALE_VITALS_MS = 6 * HOUR;

function planVitals(residents: SimulatedResident[], now: Date, random: Random): PlannedAction {
  const resident = random.weighted(residents, (candidate) =>
    !candidate.latest_vitals ||
    now.getTime() - Date.parse(candidate.latest_vitals.taken_at) > STALE_VITALS_MS
      ? 3
      : 1,
  );
  return { kind: "vitals", resident, row: nextVitals(resident.latest_vitals, now, random) };
}

/** The next set of vitals after `previous`: a small step, reverting a little toward typical. */
export function nextVitals(previous: LatestVitals | null, now: Date, random: Random): VitalsRecord {
  const base: VitalValues = previous ?? TYPICAL_VITALS;
  const next = {} as Record<VitalReading, number>;
  for (const reading of VITAL_READINGS) {
    const step = VITAL_STEPS[reading];
    const drift = REVERSION * (TYPICAL_VITALS[reading] - base[reading]);
    const move = clamp(
      drift + random.normal(0, step),
      -MAX_VITAL_STEPS * step,
      MAX_VITAL_STEPS * step,
    );
    next[reading] = base[reading] + move;
  }

  // An excursion is the seed's, and always crosses the reading's normal range, so the
  // dashboard has something to surface whatever the resident's baseline.
  let notes: string | null = null;
  if (random.chance(EXCURSION_CHANCE)) {
    switch (random.pick(["fever", "hypotension", "hypertension", "tachycardia", "hypoxia"])) {
      case "fever":
        next.temperature_f = Math.max(next.temperature_f + random.real(2, 3.5), 100.6);
        next.pulse += 15;
        notes = "Warm to touch; physician notified, acetaminophen given.";
        break;
      case "hypotension":
        next.systolic = Math.min(next.systolic - 28, 88);
        next.diastolic -= 15;
        next.pulse += 10;
        notes = "Reports dizziness on standing; assisted to bed, fluids encouraged.";
        break;
      case "hypertension":
        next.systolic = Math.max(next.systolic + 38, 142);
        next.diastolic += 15;
        notes = "Recheck in one hour; physician notified.";
        break;
      case "tachycardia":
        next.pulse = Math.max(next.pulse + 35, 102);
        notes = "Irregular rapid pulse; resting, will recheck.";
        break;
      case "hypoxia":
        next.oxygen_saturation = Math.min(next.oxygen_saturation - 7, 89);
        next.respiratory_rate += 6;
        notes = "Short of breath at rest; oxygen applied at 2 liters, physician notified.";
        break;
    }
  }

  for (const reading of VITAL_READINGS) {
    const [low, high] = VITAL_BOUNDS[reading];
    next[reading] = clamp(next[reading], low, high);
    next[reading] = reading === "temperature_f" ? round1(next[reading]) : Math.round(next[reading]);
  }
  if (next.systolic - next.diastolic < MIN_PULSE_PRESSURE) {
    next.diastolic = Math.max(VITAL_BOUNDS.diastolic[0], next.systolic - MIN_PULSE_PRESSURE);
  }

  // Weekly weights on Monday mornings, the odd extra one otherwise, and only once known.
  const mondayMorning = weekday(dateInZone(now)) === 1 && hourInZone(now) < 11;
  const weigh = previous?.weight_lb != null && (mondayMorning || random.chance(0.1));
  const weight_lb = weigh
    ? round1(clamp(previous!.weight_lb! + random.normal(0, 0.8), ...WEIGHT_BOUNDS))
    : null;

  return { ...next, taken_at: toIso(now), weight_lb, notes };
}

// ---------------------------------------------------------------------------------------------
// Administrations
// ---------------------------------------------------------------------------------------------

/** A scheduled dose is given up to this long after its time. */
export const DOSE_WINDOW_BEHIND_MS = 3 * HOUR;
/** And up to this long before it. */
export const DOSE_WINDOW_AHEAD_MS = 1 * HOUR;
/** How often the pass records an as-needed dose instead of a scheduled one. */
export const PRN_CHANCE = 0.12;
/** An as-needed order is not given again within this long. */
export const PRN_SPACING_MS = 6 * HOUR;

/** The resident's outstanding scheduled doses due around now, on active orders only. */
export function dueDoses(resident: SimulatedResident, now: Date): ScheduledDose[] {
  const active = resident.orders.filter((order) => order.status === "active");
  const outstanding = outstandingDoses(scheduledDoses(active, now), resident.administrations);
  return outstanding.filter(
    (dose) =>
      dose.dueAt.getTime() >= now.getTime() - DOSE_WINDOW_BEHIND_MS &&
      dose.dueAt.getTime() <= now.getTime() + DOSE_WINDOW_AHEAD_MS,
  );
}

/** Active as-needed orders that have not been given in the last few hours. */
export function availablePrnOrders(resident: SimulatedResident, now: Date): SimulatedOrder[] {
  return resident.orders.filter(
    (order) =>
      order.status === "active" &&
      order.frequency === "as_needed" &&
      !resident.administrations.some(
        (administration) =>
          administration.medication_order_id === order.id &&
          Date.parse(administration.administered_at) > now.getTime() - PRN_SPACING_MS,
      ),
  );
}

type DoseCandidate = { resident: SimulatedResident; order: SimulatedOrder };

function planAdministration(
  residents: SimulatedResident[],
  now: Date,
  random: Random,
): PlannedAction | null {
  const scheduled: DoseCandidate[] = residents.flatMap((resident) =>
    dueDoses(resident, now).map((dose) => ({
      resident,
      order: resident.orders.find((order) => order.id === dose.orderId)!,
    })),
  );
  const prn: DoseCandidate[] = residents.flatMap((resident) =>
    availablePrnOrders(resident, now).map((order) => ({ resident, order })),
  );
  const asNeeded = prn.length > 0 && (scheduled.length === 0 || random.chance(PRN_CHANCE));
  const candidates = asNeeded ? prn : scheduled;
  if (candidates.length === 0) return null;

  const { resident, order } = random.pick(candidates);
  const dementia = resident.condition_codes.includes(CODES.dementia);
  const status: Enums<"administration_status"> = asNeeded
    ? "given"
    : random.weighted(
        ["given", "refused", "held"] as const,
        (candidate) =>
          ({ given: dementia ? 90 : 95, refused: dementia ? 7 : 2, held: 3 })[candidate],
      );
  const notes = asNeeded
    ? prnReason(random, order.medication)
    : status === "refused"
      ? random.pick(["Refused; will re-offer", "Refused, spat out tablet", "Declined, asleep"])
      : status === "held"
        ? random.pick([
            `Held: systolic ${random.int(88, 99)}`,
            "Held: NPO for lab draw",
            "Held per physician, nausea",
          ])
        : null;

  return {
    kind: "administration",
    resident,
    order,
    row: { medication_order_id: order.id, administered_at: toIso(now), status, notes },
  };
}

function prnReason(random: Random, medication: string): string {
  const name = medication.toLowerCase();
  if (/acetaminophen|tylenol|tramadol|ibuprofen|naproxen/.test(name)) {
    return `For ${random.pick(["hip", "knee", "back", "shoulder"])} pain ${random.int(3, 6)} of 10`;
  }
  if (/albuterol/.test(name)) return "For wheezing after exertion";
  if (/nitroglycerin/.test(name)) return "For chest discomfort; relieved after one dose";
  if (/lorazepam|haloperidol|quetiapine/.test(name)) return "For agitation, per order";
  if (/ondansetron|prochlorperazine/.test(name)) return "For nausea";
  return "Given as requested";
}

// ---------------------------------------------------------------------------------------------
// Progress notes
// ---------------------------------------------------------------------------------------------

function planNote(residents: SimulatedResident[], now: Date, random: Random): PlannedAction {
  const resident = random.pick(residents);
  return {
    kind: "note",
    resident,
    row: {
      written_at: toIso(now),
      body: progressNote(random, residentContext(resident, now), shiftAt(now).key),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------------------------

const FALL_FACTOR: Readonly<Record<Enums<"mobility">, number>> = {
  independent: 0.5,
  cane: 0.9,
  walker: 1.4,
  wheelchair: 1.2,
  one_person_assist: 1,
  two_person_assist: 0.8,
  bedbound: 0.2,
};

function planIncident(residents: SimulatedResident[], now: Date, random: Random): PlannedAction {
  const risk = (resident: SimulatedResident) =>
    FALL_FACTOR[resident.mobility] * (resident.condition_codes.includes(CODES.dementia) ? 1.6 : 1);
  const resident = random.weighted(residents, (candidate) => risk(candidate) + 0.3);
  const dementia = resident.condition_codes.includes(CODES.dementia);
  const activeOrders = resident.orders.filter((order) => order.status === "active");
  const kind = random.weighted(
    ["fall", "behavioral", "medication_error"] as const,
    (candidate) =>
      ({
        fall: 60 * FALL_FACTOR[resident.mobility],
        behavioral: dementia ? 40 : 8,
        medication_error: activeOrders.length > 0 ? 6 : 0,
      })[candidate],
  );
  const occurredAt = addMinutes(now, -random.int(5, 45));
  const { description, injury } = incidentDescription(
    random,
    kind,
    residentContext(resident, now),
    {
      hour: hourInZone(occurredAt),
      medication: activeOrders.length > 0 ? random.pick(activeOrders).medication : undefined,
    },
  );
  return {
    kind: "incident",
    resident,
    row: { kind, occurred_at: toIso(occurredAt), description, injury_sustained: injury },
  };
}

// ---------------------------------------------------------------------------------------------
// Resident details
// ---------------------------------------------------------------------------------------------

/** Diet changes a nurse would record; a diet with no entry stays as it is. */
const DIET_TRANSITIONS: Readonly<Record<Enums<"diet">, readonly Enums<"diet">[]>> = {
  regular: ["mechanical_soft", "cardiac"],
  cardiac: ["regular"],
  diabetic: [],
  renal: [],
  mechanical_soft: ["regular", "pureed"],
  pureed: ["mechanical_soft", "thickened_liquids"],
  thickened_liquids: ["pureed"],
};

/** From most to least mobile; a change moves one step, more often down than up. */
const MOBILITY_LEVELS: readonly Enums<"mobility">[] = [
  "independent",
  "cane",
  "walker",
  "wheelchair",
  "one_person_assist",
  "two_person_assist",
  "bedbound",
];

const CODE_STATUS_TRANSITIONS: Readonly<
  Record<Enums<"code_status">, readonly Enums<"code_status">[]>
> = {
  full_code: ["dnr"],
  dnr: ["dnr_dni", "full_code"],
  dnr_dni: ["comfort_care", "dnr"],
  comfort_care: ["dnr_dni"],
};

type DetailChange = { changes: ResidentChanges; before: ResidentChanges };

function planResidentUpdate(
  nurse: SimulatedNurse,
  snapshot: UnitSnapshot,
  residents: SimulatedResident[],
  random: Random,
): PlannedAction | null {
  const resident = random.pick(residents);
  const options: Array<{ weight: number; plan: () => DetailChange | null }> = [
    { weight: 30, plan: () => planRoomMove(nurse, snapshot, resident, random) },
    { weight: 30, plan: () => planDietChange(resident, random) },
    { weight: 30, plan: () => planMobilityChange(resident, random) },
    { weight: 10, plan: () => planCodeStatusChange(resident, random) },
  ];
  while (options.length > 0) {
    const option = random.weighted(options, (candidate) => candidate.weight);
    const change = option.plan();
    if (change) return { kind: "resident_update", resident, ...change };
    options.splice(options.indexOf(option), 1);
  }
  return null;
}

/** Rooms on the nurse's units with a free bed, other than the resident's own. */
export function freeRooms(
  nurse: SimulatedNurse,
  snapshot: UnitSnapshot,
  resident: SimulatedResident,
): SimulatedRoom[] {
  const occupied = new Map<string, number>();
  for (const other of snapshot.residents) {
    if (other.status !== "current" || !other.room_id) continue;
    occupied.set(other.room_id, (occupied.get(other.room_id) ?? 0) + 1);
  }
  return snapshot.rooms.filter(
    (room) =>
      nurse.unit_ids.includes(room.unit_id) &&
      room.id !== resident.room_id &&
      (occupied.get(room.id) ?? 0) < room.capacity,
  );
}

function planRoomMove(
  nurse: SimulatedNurse,
  snapshot: UnitSnapshot,
  resident: SimulatedResident,
  random: Random,
): DetailChange | null {
  const rooms = freeRooms(nurse, snapshot, resident);
  if (rooms.length === 0) return null;
  // Moves within the unit are the common case.
  const room = random.weighted(rooms, (candidate) =>
    candidate.unit_id === resident.unit_id ? 4 : 1,
  );
  return {
    changes: { room_id: room.id, unit_id: room.unit_id },
    before: { room_id: resident.room_id, unit_id: resident.unit_id },
  };
}

function planDietChange(resident: SimulatedResident, random: Random): DetailChange | null {
  const options = DIET_TRANSITIONS[resident.diet];
  if (options.length === 0) return null;
  return { changes: { diet: random.pick(options) }, before: { diet: resident.diet } };
}

function planMobilityChange(resident: SimulatedResident, random: Random): DetailChange | null {
  const index = MOBILITY_LEVELS.indexOf(resident.mobility);
  const steps = [index + 1, index - 1].filter((i) => i >= 0 && i < MOBILITY_LEVELS.length);
  if (steps.length === 0) return null;
  const next = random.weighted(steps, (i) => (i > index ? 60 : 40));
  return { changes: { mobility: MOBILITY_LEVELS[next] }, before: { mobility: resident.mobility } };
}

function planCodeStatusChange(resident: SimulatedResident, random: Random): DetailChange | null {
  const options = CODE_STATUS_TRANSITIONS[resident.code_status];
  if (options.length === 0) return null;
  return {
    changes: { code_status: random.pick(options) },
    before: { code_status: resident.code_status },
  };
}

// ---------------------------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------------------------

/** Dialysis is left out: it is a standing pattern the seed lays down, not a booking. */
const APPOINTMENT_WEIGHTS: Readonly<Partial<Record<Enums<"appointment_kind">, number>>> = {
  specialist: 45,
  imaging: 20,
  hospital: 12,
  dental: 8,
  other: 15,
};

function planAppointment(
  snapshot: UnitSnapshot,
  residents: SimulatedResident[],
  now: Date,
  random: Random,
): PlannedAction {
  const resident = random.pick(residents);
  const kinds = Object.keys(APPOINTMENT_WEIGHTS) as Enums<"appointment_kind">[];
  const kind = random.weighted(kinds, (candidate) => APPOINTMENT_WEIGHTS[candidate] ?? 0);
  // A weekday one to three weeks out, in office hours.
  let date = addDays(dateInZone(now), random.int(1, 21));
  while (weekday(date) === 0 || weekday(date) === 6) date = addDays(date, 1);
  const scheduledAt = atZoned(date, random.int(8, 15), random.pick([0, 15, 30, 45]));
  const facility = snapshot.facilities.find((candidate) => candidate.id === resident.facility_id);
  const { location, purpose } = appointmentDetails(
    random,
    kind,
    facility?.city ?? "Boston",
    residentContext(resident, now),
  );
  return {
    kind: "appointment",
    resident,
    row: { kind, scheduled_at: toIso(scheduledAt), location, purpose },
  };
}

// ---------------------------------------------------------------------------------------------
// Describing an action, for the log
// ---------------------------------------------------------------------------------------------

const DIET_WORDS: Readonly<Record<Enums<"diet">, string>> = {
  regular: "regular",
  cardiac: "cardiac",
  diabetic: "diabetic",
  renal: "renal",
  mechanical_soft: "mechanical soft",
  pureed: "pureed",
  thickened_liquids: "thickened liquids",
};

const MOBILITY_WORDS: Readonly<Record<Enums<"mobility">, string>> = {
  independent: "independent",
  cane: "cane",
  walker: "walker",
  wheelchair: "wheelchair",
  one_person_assist: "one-person assist",
  two_person_assist: "two-person assist",
  bedbound: "bedbound",
};

const CODE_STATUS_WORDS: Readonly<Record<Enums<"code_status">, string>> = {
  full_code: "full code",
  dnr: "DNR",
  dnr_dni: "DNR/DNI",
  comfort_care: "comfort care",
};

/** "recorded vitals for Harold Blake: 132/78, pulse 71, 98.1 °F, SpO2 96%". */
export function describeAction(action: PlannedAction, snapshot?: UnitSnapshot): string {
  const name = `${action.resident.first_name} ${action.resident.last_name}`;
  switch (action.kind) {
    case "vitals": {
      const v = action.row;
      return `recorded vitals for ${name}: ${v.systolic}/${v.diastolic}, pulse ${v.pulse}, ${v.temperature_f.toFixed(1)} °F, SpO2 ${v.oxygen_saturation}%${v.notes ? " (out of range)" : ""}`;
    }
    case "administration": {
      const medication = action.order.medication;
      switch (action.row.status) {
        case "refused":
          return `recorded ${medication} as refused by ${name}`;
        case "held":
          return `held ${medication} for ${name}`;
        default:
          return `gave ${medication} to ${name}${action.order.frequency === "as_needed" ? " as needed" : ""}`;
      }
    }
    case "note":
      return `wrote a progress note for ${name}`;
    case "incident":
      return `reported ${action.row.kind === "fall" ? "a fall" : action.row.kind === "behavioral" ? "a behavioral event" : "a medication error"} for ${name}${action.row.injury_sustained ? ", with injury" : ""}`;
    case "resident_update": {
      const { changes } = action;
      if (changes.room_id) {
        const room = snapshot?.rooms.find((candidate) => candidate.id === changes.room_id);
        const unit = snapshot?.units.find((candidate) => candidate.id === changes.unit_id);
        const where = room ? `Room ${room.number}${unit ? `, ${unit.name}` : ""}` : "another room";
        return `moved ${name} to ${where}`;
      }
      if (changes.diet) return `changed ${name}'s diet to ${DIET_WORDS[changes.diet]}`;
      if (changes.mobility)
        return `changed ${name}'s mobility to ${MOBILITY_WORDS[changes.mobility]}`;
      if (changes.code_status) {
        return `changed ${name}'s code status to ${CODE_STATUS_WORDS[changes.code_status]}`;
      }
      return `updated ${name}'s details`;
    }
    case "appointment":
      return `scheduled ${action.row.purpose.toLowerCase()} for ${name} on ${formatMonthDay(action.row.scheduled_at)}`;
  }
}
