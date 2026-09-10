/** Willowbrook Care's facilities are in Massachusetts; dates are shown in US conventions. */
export const DEMO_TIME_ZONE = "America/New_York";

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "long",
  timeZone: DEMO_TIME_ZONE,
});

/** Formats an ISO timestamp as, for example, "Sep 9, 2026, 8:41:07 PM EDT". */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return dateTimeFormat.format(date);
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  // Calendar dates from the database carry no time; format them as the date they are.
  timeZone: "UTC",
});

/** Formats a calendar date (`2026-09-09`) as, for example, "Sep 9, 2026". */
export function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormat.format(date);
}

/** Whole years between a calendar date of birth and a reference date (today by default). */
export function ageOn(dateOfBirth: string, on: Date = new Date()): number {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const shortDateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: DEMO_TIME_ZONE,
});

/** Formats an ISO timestamp as, for example, "Sep 9, 2026, 7:31 AM". */
export function formatShortDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return shortDateTimeFormat.format(date);
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
  timeZone: DEMO_TIME_ZONE,
});

/** Formats an ISO timestamp as its wall-clock time, for example "7:31 AM". */
export function formatTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return timeFormat.format(date);
}

export type StaffName = { first_name: string; last_name: string; credentials: string | null };

/** "Maria Alvarez, RN", or null when no staff member is recorded or visible. */
export function formatStaffName(staff: StaffName | null | undefined): string | null {
  if (!staff) return null;
  const name = `${staff.first_name} ${staff.last_name}`.trim();
  return staff.credentials ? `${name}, ${staff.credentials}` : name;
}

const monthDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: DEMO_TIME_ZONE,
});

/** Formats an ISO timestamp as a chart tick, for example "Sep 9". */
export function formatMonthDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return monthDayFormat.format(date);
}
