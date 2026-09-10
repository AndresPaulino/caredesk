/**
 * A focus is a dashboard tile's set of residents applied to the resident list as a filter:
 * `/residents?focus=overdue-assessments`. Each one names the flag `resident_dashboard_at()`
 * computes for it, so the number on the tile and the list behind it come from one query.
 */

export const RESIDENT_FOCUSES = [
  {
    key: "medications-due",
    flag: "medication_due",
    label: "Medications due this shift",
    description: "Current residents with a scheduled dose not yet recorded this shift.",
  },
  {
    key: "medications-overdue",
    flag: "medication_overdue",
    label: "Overdue administrations",
    description:
      "Current residents with a scheduled dose more than an hour past its time in the last 24 hours and nothing recorded for it.",
  },
  {
    key: "overdue-assessments",
    flag: "overdue_assessment",
    label: "Overdue assessments",
    description:
      "Current residents with an assessment kind past its due interval, or one every resident is expected to have and never done.",
  },
  {
    key: "out-of-range-vitals",
    flag: "out_of_range_vitals",
    label: "Out-of-range vitals",
    description:
      "Current residents with a vital reading outside its normal range in the last 24 hours.",
  },
  {
    key: "recent-incidents",
    flag: "recent_incident",
    label: "Incidents in the last 7 days",
    description: "Current residents with an incident reported in the last seven days.",
  },
  {
    key: "upcoming-appointments",
    flag: "upcoming_appointment",
    label: "Appointments today and tomorrow",
    description: "Current residents with an appointment scheduled for today or tomorrow.",
  },
] as const;

export type ResidentFocus = (typeof RESIDENT_FOCUSES)[number];
export type ResidentFocusKey = ResidentFocus["key"];
export type ResidentFocusFlag = ResidentFocus["flag"];

export const residentFocusKeys = RESIDENT_FOCUSES.map((focus) => focus.key) as [
  ResidentFocusKey,
  ...ResidentFocusKey[],
];

export function isResidentFocusKey(value: unknown): value is ResidentFocusKey {
  return RESIDENT_FOCUSES.some((focus) => focus.key === value);
}

export function focusFor(key: ResidentFocusKey): ResidentFocus {
  const focus = RESIDENT_FOCUSES.find((candidate) => candidate.key === key);
  if (!focus) throw new Error(`Unknown resident focus: ${key}`);
  return focus;
}
