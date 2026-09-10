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
