import { formatTime } from "../format";
import { addDays, atZoned, dateInZone } from "../time";

export type ShiftKey = "day" | "evening" | "night";

export type ShiftInfo = {
  key: ShiftKey;
  name: string;
  /** Wall-clock hour the shift starts, in the facilities' time zone. */
  startHour: number;
  /** Wall-clock hour it ends; earlier than `startHour` for the shift that crosses midnight. */
  endHour: number;
};

/**
 * The three nursing shifts. The database table `shifts` holds the same rows and is what the
 * dashboard functions use; this copy names them without a round trip, and the policy test
 * checks they agree.
 */
export const SHIFTS: readonly ShiftInfo[] = [
  { key: "day", name: "Day shift", startHour: 7, endHour: 15 },
  { key: "evening", name: "Evening shift", startHour: 15, endHour: 23 },
  { key: "night", name: "Night shift", startHour: 23, endHour: 7 },
];

export type ShiftWindow = ShiftInfo & {
  startsAt: Date;
  /** Exclusive: the next shift starts at this instant. */
  endsAt: Date;
};

/**
 * The shift an instant falls in, with the instants it starts and ends. Each shift is tried on
 * the instant's local day and the day before, so the night shift that began yesterday evening
 * is found at two in the morning.
 */
export function shiftAt(instant: Date): ShiftWindow {
  const today = dateInZone(instant);
  let found: ShiftWindow | null = null;
  for (const day of [addDays(today, -1), today]) {
    for (const shift of SHIFTS) {
      const startsAt = atZoned(day, shift.startHour);
      const endsAt = atZoned(
        shift.endHour <= shift.startHour ? addDays(day, 1) : day,
        shift.endHour,
      );
      if (instant >= startsAt && instant < endsAt && (!found || startsAt > found.startsAt)) {
        found = { ...shift, startsAt, endsAt };
      }
    }
  }
  // The three shifts cover every hour of every day.
  if (!found) throw new Error(`No shift covers ${instant.toISOString()}`);
  return found;
}

/** "Day shift, 7:00 AM to 3:00 PM". */
export function describeShift(window: ShiftWindow): string {
  return `${window.name}, ${formatTime(window.startsAt)} to ${formatTime(window.endsAt)}`;
}
