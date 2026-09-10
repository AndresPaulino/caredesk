import { formatStaffName, type StaffName } from "../format";
import type { RecordTabKey } from "../residents/record-tabs";
import type { Enums } from "../supabase/database.types";

import { ASSESSMENT_KIND_BY_KEY } from "./assessment-kinds";
import { INCIDENT_KIND_LABELS } from "./labels";

/**
 * The clinical timeline: assessments, lab results, incidents, and progress notes merged into
 * one list, newest first, each entry labeled by type and attributed to its staff member. Lab
 * results are grouped by the lab draw they came from, so one draw is one entry.
 */

export type TimelineEntryType = "assessment" | "lab_results" | "incident" | "progress_note";

export const TIMELINE_TYPE_LABELS: Readonly<Record<TimelineEntryType, string>> = {
  assessment: "Assessment",
  lab_results: "Lab results",
  incident: "Incident",
  progress_note: "Progress note",
};

export type TimelineInput = {
  assessments: ReadonlyArray<{
    id: string;
    kind: Enums<"assessment_kind">;
    performed_at: string;
    findings: string;
    score: number | null;
    staff: StaffName | null;
  }>;
  lab_results: ReadonlyArray<{
    id: string;
    assessment_id: string | null;
    description: string;
    value: number;
    units: string;
    reference_low: number | null;
    reference_high: number | null;
    abnormal: boolean;
    resulted_at: string;
  }>;
  incidents: ReadonlyArray<{
    id: string;
    kind: Enums<"incident_kind">;
    occurred_at: string;
    description: string;
    injury_sustained: boolean;
    staff: StaffName | null;
  }>;
  progress_notes: ReadonlyArray<{
    id: string;
    written_at: string;
    body: string;
    staff: StaffName | null;
  }>;
};

export type TimelineEntry = {
  id: string;
  type: TimelineEntryType;
  /** The instant the entry happened, as an ISO timestamp. */
  at: string;
  title: string;
  detail: string | null;
  /** "Maria Alvarez, RN", or null when no staff member is recorded (lab results). */
  staff: string | null;
  /** The record tab holding the full record, or null for records without a tab. */
  tab: RecordTabKey | null;
  /** True for entries a nurse should notice first: an incident, or an abnormal lab result. */
  attention: boolean;
};

const TYPE_ORDER: Readonly<Record<TimelineEntryType, number>> = {
  incident: 0,
  assessment: 1,
  lab_results: 2,
  progress_note: 3,
};

export function buildTimeline(input: TimelineInput): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const assessment of input.assessments) {
    const name = ASSESSMENT_KIND_BY_KEY.get(assessment.kind)?.name ?? assessment.kind;
    entries.push({
      id: `assessment:${assessment.id}`,
      type: "assessment",
      at: assessment.performed_at,
      title:
        assessment.kind === "fall_risk" && assessment.score !== null
          ? `${name} (Morse ${assessment.score})`
          : name,
      detail: assessment.findings,
      staff: formatStaffName(assessment.staff),
      tab: null,
      attention: false,
    });
  }

  entries.push(...labDrawEntries(input));

  for (const incident of input.incidents) {
    entries.push({
      id: `incident:${incident.id}`,
      type: "incident",
      at: incident.occurred_at,
      title: incident.injury_sustained
        ? `${INCIDENT_KIND_LABELS[incident.kind]}, with injury`
        : INCIDENT_KIND_LABELS[incident.kind],
      detail: incident.description,
      staff: formatStaffName(incident.staff),
      tab: "incidents",
      attention: true,
    });
  }

  for (const note of input.progress_notes) {
    entries.push({
      id: `note:${note.id}`,
      type: "progress_note",
      at: note.written_at,
      title: "Progress note",
      detail: note.body,
      staff: formatStaffName(note.staff),
      tab: "notes",
      attention: false,
    });
  }

  return entries.sort(
    (a, b) =>
      Date.parse(b.at) - Date.parse(a.at) ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.id.localeCompare(b.id),
  );
}

/** One entry per lab draw, attributed to whoever drew it, listing any results out of range. */
function labDrawEntries(input: TimelineInput): TimelineEntry[] {
  const assessmentById = new Map(input.assessments.map((row) => [row.id, row]));
  const groups = new Map<string, TimelineInput["lab_results"][number][]>();
  for (const result of input.lab_results) {
    const key = result.assessment_id ?? `resulted:${result.resulted_at}`;
    const group = groups.get(key);
    if (group) group.push(result);
    else groups.set(key, [result]);
  }

  return [...groups.entries()].map(([key, results]) => {
    const draw = results[0].assessment_id
      ? assessmentById.get(results[0].assessment_id)
      : undefined;
    const abnormal = results.filter((result) => result.abnormal);
    const at = results.reduce(
      (latest, result) =>
        Date.parse(result.resulted_at) > Date.parse(latest) ? result.resulted_at : latest,
      results[0].resulted_at,
    );
    const count = `${results.length} ${results.length === 1 ? "result" : "results"}`;
    const detail =
      abnormal.length === 0
        ? `${count}, all within reference range.`
        : `${abnormal.length} of ${results.length} outside the reference range: ${abnormal
            .map(describeResult)
            .join(", ")}.`;
    return {
      id: `lab:${key}`,
      type: "lab_results",
      at,
      title: "Lab results",
      detail,
      staff: draw ? formatStaffName(draw.staff) : null,
      tab: "labs",
      attention: abnormal.length > 0,
    } satisfies TimelineEntry;
  });
}

function describeResult(result: TimelineInput["lab_results"][number]): string {
  const direction =
    result.reference_high !== null && result.value > result.reference_high
      ? "high"
      : result.reference_low !== null && result.value < result.reference_low
        ? "low"
        : "abnormal";
  return `${result.description} ${result.value} ${result.units} (${direction})`;
}
