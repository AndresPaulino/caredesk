import { addDays, dateInZone, daysBetween } from "../time";

import { ASSESSMENT_KINDS, type AssessmentKind, type AssessmentKindInfo } from "./assessment-kinds";

/**
 * The assessment summary: for every assessment kind, when it was last done and when the next
 * one is due. This is the record behind "when was the last exam" and the rule behind "overdue"
 * on the dashboard, so the dates come from one place.
 *
 * A kind is overdue when its latest assessment is older than the kind's due interval or, for
 * the kinds every current resident is expected to have, when there is none at all. Kinds that
 * apply only once done (a wound check, podiatry) are simply "not on record" until the first
 * one. Nothing is due for a former resident.
 */

export type AssessmentSummaryStatus =
  "overdue" | "due_soon" | "up_to_date" | "not_on_record" | "not_due";

export type SummarizableAssessment = {
  id: string;
  kind: AssessmentKind;
  performed_at: string;
  archived_at?: string | null;
};

export type AssessmentSummaryEntry = {
  kind: AssessmentKind;
  name: string;
  dueEveryDays: number;
  expectedForEveryone: boolean;
  /** The latest assessment of this kind, or null when there is none. */
  lastDone: {
    id: string;
    performedAt: string;
    /** The calendar date, in the facilities' time zone, the assessment was performed on. */
    performedOn: string;
  } | null;
  /** The calendar date the next one is due, or null when nothing is due. */
  nextDue: string | null;
  /** Days from today until `nextDue`; negative once overdue. Null when nothing is due. */
  daysUntilDue: number | null;
  status: AssessmentSummaryStatus;
};

/** An assessment due within this many days is "due soon". */
export const DUE_SOON_DAYS = 14;

export type SummarizeOptions = {
  /** Today's calendar date in the facilities' time zone (`dateInZone(new Date())`). */
  today: string;
  /** Former residents have nothing due. */
  residentStatus: "current" | "former";
  kinds?: readonly AssessmentKindInfo[];
};

export function summarizeAssessments(
  assessments: readonly SummarizableAssessment[],
  { today, residentStatus, kinds = ASSESSMENT_KINDS }: SummarizeOptions,
): AssessmentSummaryEntry[] {
  const latest = latestByKind(assessments);

  return kinds.map((info) => {
    const last = latest.get(info.kind) ?? null;
    const lastDone = last
      ? {
          id: last.id,
          performedAt: last.performed_at,
          performedOn: dateInZone(new Date(last.performed_at)),
        }
      : null;

    if (residentStatus === "former") {
      return { ...describe(info), lastDone, nextDue: null, daysUntilDue: null, status: "not_due" };
    }
    if (!lastDone) {
      return {
        ...describe(info),
        lastDone,
        nextDue: null,
        daysUntilDue: null,
        status: info.expectedForEveryone ? "overdue" : "not_on_record",
      };
    }

    const nextDue = addDays(lastDone.performedOn, info.dueEveryDays);
    const daysUntilDue = daysBetween(today, nextDue);
    const status: AssessmentSummaryStatus =
      daysUntilDue < 0 ? "overdue" : daysUntilDue <= DUE_SOON_DAYS ? "due_soon" : "up_to_date";
    return { ...describe(info), lastDone, nextDue, daysUntilDue, status };
  });
}

/** The latest unarchived assessment of each kind. */
export function latestByKind<T extends SummarizableAssessment>(
  assessments: readonly T[],
): ReadonlyMap<AssessmentKind, T> {
  const latest = new Map<AssessmentKind, T>();
  for (const assessment of assessments) {
    if (assessment.archived_at) continue;
    const current = latest.get(assessment.kind);
    if (!current || Date.parse(assessment.performed_at) > Date.parse(current.performed_at)) {
      latest.set(assessment.kind, assessment);
    }
  }
  return latest;
}

function describe(info: AssessmentKindInfo) {
  return {
    kind: info.kind,
    name: info.name,
    dueEveryDays: info.dueEveryDays,
    expectedForEveryone: info.expectedForEveryone,
  };
}
