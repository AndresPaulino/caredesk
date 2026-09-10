import type { Enums } from "../supabase/database.types";

export type AssessmentKind = Enums<"assessment_kind">;

export type AssessmentKindInfo = {
  kind: AssessmentKind;
  name: string;
  /** Days after an assessment of this kind before the next one is due. */
  dueEveryDays: number;
  /**
   * True for kinds every current resident is expected to have, so a resident with none at all
   * counts as overdue. False for kinds that apply only once done (a wound check is due only for
   * a resident who has a wound).
   */
  expectedForEveryone: boolean;
};

/**
 * The eight assessment kinds and their due intervals. The database table `assessment_kinds`
 * holds the same rows and is the source of truth for queries; this copy exists so the seed and
 * the UI can name kinds without a round trip. The policy integration test checks they agree.
 */
export const ASSESSMENT_KINDS: readonly AssessmentKindInfo[] = [
  { kind: "physician_visit", name: "Physician visit", dueEveryDays: 60, expectedForEveryone: true },
  {
    kind: "nursing_assessment",
    name: "Nursing assessment",
    dueEveryDays: 90,
    expectedForEveryone: true,
  },
  { kind: "fall_risk", name: "Fall-risk assessment", dueEveryDays: 90, expectedForEveryone: true },
  { kind: "lab_draw", name: "Lab draw", dueEveryDays: 90, expectedForEveryone: true },
  { kind: "podiatry", name: "Podiatry", dueEveryDays: 90, expectedForEveryone: false },
  { kind: "dental", name: "Dental", dueEveryDays: 365, expectedForEveryone: false },
  { kind: "vision", name: "Vision", dueEveryDays: 365, expectedForEveryone: false },
  { kind: "wound_check", name: "Wound check", dueEveryDays: 7, expectedForEveryone: false },
];

export const ASSESSMENT_KIND_BY_KEY: ReadonlyMap<AssessmentKind, AssessmentKindInfo> = new Map(
  ASSESSMENT_KINDS.map((info) => [info.kind, info]),
);
