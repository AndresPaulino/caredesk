import { DEMO_TIME_ZONE } from "./format";

/**
 * Calendar dates are `YYYY-MM-DD` strings; instants are `Date`s. Facilities keep Eastern time,
 * so "7:30 in the morning" is resolved in that zone, daylight saving included.
 */

const zoneFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: DEMO_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function wallClock(instant: Date): WallClock {
  const values: Record<string, number> = {};
  for (const part of zoneFormat.formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values as WallClock;
}

function offsetMinutes(instant: Date): number {
  const clock = wallClock(instant);
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The calendar date an instant falls on in the facilities' time zone. */
export function dateInZone(instant: Date): string {
  const clock = wallClock(instant);
  return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}

/** The instant at a wall-clock time on a calendar date in the facilities' time zone. */
export function atZoned(date: string, hour = 0, minute = 0): Date {
  const [year, month, day] = date.split("-").map(Number);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstGuess = asIfUtc - offsetMinutes(new Date(asIfUtc)) * 60_000;
  // The first guess can land on the wrong side of a daylight-saving change; ask again from there.
  return new Date(asIfUtc - offsetMinutes(new Date(firstGuess)) * 60_000);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Day of the week for a calendar date, 0 = Sunday. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function toIso(instant: Date): string {
  return instant.toISOString();
}

export function earliest(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
