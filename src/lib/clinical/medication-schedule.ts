import type { Enums } from "../supabase/database.types";

export type MedicationFrequency = Enums<"medication_frequency">;

export const MEDICATION_FREQUENCY_LABELS: Readonly<Record<MedicationFrequency, string>> = {
  once_daily: "Once daily",
  twice_daily: "Twice daily",
  three_times_daily: "Three times daily",
  four_times_daily: "Four times daily",
  at_bedtime: "At bedtime",
  weekly: "Weekly",
  as_needed: "As needed",
};

/**
 * The standard administration times for each frequency, as hours of the day in the facility's
 * time zone. Weekly medications are given on Monday morning. As-needed medications have no
 * schedule, so they are never "due" or "overdue".
 */
export const SCHEDULED_HOURS: Readonly<Record<MedicationFrequency, readonly number[]>> = {
  once_daily: [9],
  twice_daily: [9, 21],
  three_times_daily: [9, 13, 21],
  four_times_daily: [9, 13, 17, 21],
  at_bedtime: [21],
  weekly: [9],
  as_needed: [],
};

/** Day of the week (0 = Sunday) weekly medications are given. */
export const WEEKLY_DOSE_DAY = 1;
