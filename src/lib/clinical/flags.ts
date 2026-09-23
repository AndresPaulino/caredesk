import type { Enums } from "../supabase/database.types";
import { CODE_STATUS_LABELS } from "../residents/labels";

/**
 * Resident flags: the three facts a nurse checks before touching a resident, shown in the
 * standardized wristband colours (ADR 0005). One function, so the resident list and the
 * resident banner always agree on who carries which flag.
 */

export type ResidentFlagKey = "allergy" | "fall-risk" | "dnr";

export type ResidentFlag = {
  key: ResidentFlagKey;
  /** The chip's text, for example "DNR/DNI" or "Allergy". */
  label: string;
  /** Why the flag is set, for a tooltip or screen readers. */
  detail: string;
};

/** Morse Fall Scale: 45 and above is high risk. */
export const MORSE_HIGH_RISK = 45;
/** A fall this recent flags fall risk whatever the last score said. */
export const RECENT_FALL_DAYS = 30;

export type FlagInputs = {
  codeStatus: Enums<"code_status">;
  allergies: { description: string; archived_at?: string | null }[];
  /** Fall-risk assessments; only the latest score counts. */
  fallRiskAssessments: {
    performed_at: string;
    score: number | null;
    archived_at?: string | null;
  }[];
  incidents: { kind: Enums<"incident_kind">; occurred_at: string; archived_at?: string | null }[];
};

export function residentFlags(inputs: FlagInputs, now: Date = new Date()): ResidentFlag[] {
  const flags: ResidentFlag[] = [];

  if (inputs.codeStatus !== "full_code") {
    const label = CODE_STATUS_LABELS[inputs.codeStatus];
    flags.push({ key: "dnr", label, detail: `Code status: ${label}` });
  }

  const allergies = inputs.allergies.filter((allergy) => !allergy.archived_at);
  if (allergies.length > 0) {
    flags.push({
      key: "allergy",
      label: allergies.length === 1 ? `Allergy: ${allergies[0].description}` : "Allergies",
      detail: `Allergies: ${allergies.map((allergy) => allergy.description).join(", ")}`,
    });
  }

  const fallRisk = fallRiskReason(inputs, now);
  if (fallRisk) flags.push({ key: "fall-risk", label: "Fall risk", detail: fallRisk });

  return flags;
}

function fallRiskReason(inputs: FlagInputs, now: Date): string | null {
  const cutoff = now.getTime() - RECENT_FALL_DAYS * 24 * 60 * 60 * 1000;
  const recentFalls = inputs.incidents.filter(
    (incident) =>
      !incident.archived_at &&
      incident.kind === "fall" &&
      new Date(incident.occurred_at).getTime() >= cutoff &&
      new Date(incident.occurred_at).getTime() <= now.getTime(),
  );
  if (recentFalls.length > 0) {
    return `${recentFalls.length === 1 ? "A fall" : `${recentFalls.length} falls`} in the last ${RECENT_FALL_DAYS} days`;
  }

  const latest = inputs.fallRiskAssessments
    .filter((assessment) => !assessment.archived_at)
    .toSorted((a, b) => b.performed_at.localeCompare(a.performed_at))[0];
  if (latest?.score != null && latest.score >= MORSE_HIGH_RISK) {
    return `Morse Fall Scale ${latest.score} on the last fall-risk assessment`;
  }
  return null;
}
