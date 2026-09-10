/**
 * The record tabs on a resident's page, one per record type plus the audit trail. The active tab lives in the URL
 * (`?tab=medications`) so a link, including an assistant source chip, can open a resident on
 * the tab that holds the record.
 */

export const RECORD_TABS = [
  { key: "conditions", label: "Conditions" },
  { key: "medications", label: "Medications" },
  { key: "vitals", label: "Vitals" },
  { key: "allergies", label: "Allergies" },
  { key: "labs", label: "Lab results" },
  { key: "care-plan", label: "Care plan" },
  { key: "incidents", label: "Incidents" },
  { key: "notes", label: "Progress notes" },
  { key: "appointments", label: "Appointments" },
  { key: "family", label: "Family contacts" },
  { key: "audit", label: "Audit trail" },
] as const;

export type RecordTabKey = (typeof RECORD_TABS)[number]["key"];

export const DEFAULT_RECORD_TAB: RecordTabKey = "conditions";

export const RECORD_TAB_PARAM = "tab";

export function isRecordTabKey(value: unknown): value is RecordTabKey {
  return RECORD_TABS.some((tab) => tab.key === value);
}

/** The tab a `?tab=` value names, or the first tab when it names none. */
export function parseRecordTab(value: string | string[] | undefined): RecordTabKey {
  const single = Array.isArray(value) ? value[0] : value;
  return isRecordTabKey(single) ? single : DEFAULT_RECORD_TAB;
}

/** The resident page, opened on a tab when one is given. */
export function residentHref(residentId: string, tab?: RecordTabKey): string {
  const base = `/residents/${residentId}`;
  return tab ? `${base}?${RECORD_TAB_PARAM}=${tab}` : base;
}
