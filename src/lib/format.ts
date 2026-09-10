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
