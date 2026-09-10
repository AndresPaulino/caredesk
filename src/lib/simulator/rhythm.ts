/**
 * The shift rhythm: what kind of care gets recorded at each hour of the day, and how busy the
 * hour is. Mornings are vitals and resident details (the intake burst), midday is the
 * medication pass, afternoons are notes and scheduling, evenings the second pass, and the
 * night is quiet: fewer actions, mostly notes and checks, no paperwork.
 */
import { DEMO_TIME_ZONE } from "../format";

import { ACTION_KINDS, type ActionKind } from "./types";

import type { Random } from "../seed/random";

export type RhythmBand = {
  name: "night" | "morning" | "midday" | "afternoon" | "evening";
  /** First wall-clock hour of the band, in the facilities' time zone. */
  from: number;
  /** Hour the band ends (exclusive); earlier than `from` for the band that crosses midnight. */
  to: number;
  /** How busy the band is relative to the day: the interval between actions is divided by it. */
  activity: number;
  weights: Readonly<Record<ActionKind, number>>;
};

export const RHYTHM: readonly RhythmBand[] = [
  {
    name: "night",
    from: 23,
    to: 6,
    activity: 0.4,
    weights: {
      vitals: 30,
      administration: 10,
      note: 50,
      incident: 3,
      resident_update: 0,
      appointment: 0,
    },
  },
  {
    name: "morning",
    from: 6,
    to: 11,
    activity: 1,
    weights: {
      vitals: 42,
      administration: 25,
      note: 8,
      incident: 1,
      resident_update: 16,
      appointment: 8,
    },
  },
  {
    name: "midday",
    from: 11,
    to: 15,
    activity: 1,
    weights: {
      vitals: 12,
      administration: 48,
      note: 15,
      incident: 1,
      resident_update: 8,
      appointment: 16,
    },
  },
  {
    name: "afternoon",
    from: 15,
    to: 19,
    activity: 1,
    weights: {
      vitals: 15,
      administration: 18,
      note: 38,
      incident: 2,
      resident_update: 12,
      appointment: 15,
    },
  },
  {
    name: "evening",
    from: 19,
    to: 23,
    activity: 0.8,
    weights: {
      vitals: 22,
      administration: 38,
      note: 30,
      incident: 2,
      resident_update: 3,
      appointment: 5,
    },
  },
];

/** By day, one action every 30 to 90 seconds at pace 1. */
export const BASE_INTERVAL_MS: readonly [min: number, max: number] = [30_000, 90_000];

const hourFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DEMO_TIME_ZONE,
  hourCycle: "h23",
  hour: "numeric",
});

/** The wall-clock hour (0 to 23) of an instant in the facilities' time zone. */
export function hourInZone(instant: Date): number {
  return Number(hourFormat.format(instant));
}

export function bandAt(instant: Date): RhythmBand {
  const hour = hourInZone(instant);
  const band = RHYTHM.find(({ from, to }) =>
    from < to ? hour >= from && hour < to : hour >= from || hour < to,
  );
  // The bands cover every hour.
  if (!band) throw new Error(`No rhythm band covers hour ${hour}`);
  return band;
}

/**
 * The kinds of action worth trying at an instant, likeliest first: a weighted draw without
 * replacement, so when the first kind has nothing plausible to do the next is tried, and a
 * kind with no weight in the band is never tried.
 */
export function actionOrder(random: Random, instant: Date): ActionKind[] {
  const { weights } = bandAt(instant);
  const remaining = ACTION_KINDS.filter((kind) => weights[kind] > 0);
  const order: ActionKind[] = [];
  while (remaining.length > 0) {
    const kind = random.weighted(remaining, (candidate) => weights[candidate]);
    order.push(kind);
    remaining.splice(remaining.indexOf(kind), 1);
  }
  return order;
}

/**
 * How long to wait before the next action: the base interval, shortened by the pace and
 * stretched by how quiet the hour is. Pace 10 is ten times faster than real time.
 */
export function nextIntervalMs(random: Random, instant: Date, pace: number): number {
  if (!(pace > 0)) throw new Error(`The pace must be a positive number, got ${pace}`);
  const [min, max] = BASE_INTERVAL_MS;
  return Math.round(random.real(min, max) / pace / bandAt(instant).activity);
}
