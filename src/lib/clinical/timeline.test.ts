import { describe, expect, it } from "vitest";

import { buildTimeline, type TimelineInput } from "./timeline";

const nurse = { first_name: "Maria", last_name: "Alvarez", credentials: "RN" };
const physician = { first_name: "Ruth", last_name: "Chen", credentials: "MD" };

const input: TimelineInput = {
  assessments: [
    {
      id: "draw",
      kind: "lab_draw",
      performed_at: "2026-09-08T10:00:00.000Z",
      findings: "Basic metabolic panel drawn.",
      score: null,
      staff: nurse,
    },
    {
      id: "fall-risk",
      kind: "fall_risk",
      performed_at: "2026-09-09T13:00:00.000Z",
      findings: "Unsteady gait; walker in reach.",
      score: 45,
      staff: nurse,
    },
    {
      id: "visit",
      kind: "physician_visit",
      performed_at: "2026-09-01T15:00:00.000Z",
      findings: "Stable.",
      score: null,
      staff: physician,
    },
  ],
  lab_results: [
    {
      id: "glucose",
      assessment_id: "draw",
      description: "Glucose",
      value: 132,
      units: "mg/dL",
      reference_low: 70,
      reference_high: 99,
      abnormal: true,
      resulted_at: "2026-09-08T18:00:00.000Z",
    },
    {
      id: "sodium",
      assessment_id: "draw",
      description: "Sodium",
      value: 140,
      units: "mmol/L",
      reference_low: 135,
      reference_high: 145,
      abnormal: false,
      resulted_at: "2026-09-08T18:05:00.000Z",
    },
    {
      id: "orphan",
      assessment_id: null,
      description: "Hemoglobin",
      value: 11.2,
      units: "g/dL",
      reference_low: 12,
      reference_high: 16,
      abnormal: true,
      resulted_at: "2026-08-20T12:00:00.000Z",
    },
  ],
  incidents: [
    {
      id: "fall",
      kind: "fall",
      occurred_at: "2026-09-09T13:00:00.000Z",
      description: "Found on the floor beside the bed.",
      injury_sustained: true,
      staff: nurse,
    },
  ],
  progress_notes: [
    {
      id: "note",
      written_at: "2026-09-09T22:45:00.000Z",
      body: "Slept through the evening.",
      staff: null,
    },
  ],
};

describe("buildTimeline", () => {
  const timeline = buildTimeline(input);

  it("merges every type newest first, incidents ahead of ties", () => {
    expect(timeline.map((entry) => [entry.type, entry.at])).toEqual([
      ["progress_note", "2026-09-09T22:45:00.000Z"],
      ["incident", "2026-09-09T13:00:00.000Z"],
      ["assessment", "2026-09-09T13:00:00.000Z"],
      ["lab_results", "2026-09-08T18:05:00.000Z"],
      ["assessment", "2026-09-08T10:00:00.000Z"],
      ["assessment", "2026-09-01T15:00:00.000Z"],
      ["lab_results", "2026-08-20T12:00:00.000Z"],
    ]);
  });

  it("labels each entry and attributes it to its staff member", () => {
    const [note, incident, fallRisk, , , visit] = timeline;
    expect(note).toMatchObject({ title: "Progress note", staff: null, tab: "notes" });
    expect(incident).toMatchObject({
      title: "Fall, with injury",
      staff: "Maria Alvarez, RN",
      tab: "incidents",
      attention: true,
    });
    expect(fallRisk).toMatchObject({ title: "Fall-risk assessment (Morse 45)", tab: null });
    expect(visit).toMatchObject({ title: "Physician visit", staff: "Ruth Chen, MD" });
  });

  it("groups lab results by their draw, credits whoever drew them, and lists abnormal ones", () => {
    const draw = timeline.find((entry) => entry.id === "lab:draw")!;
    expect(draw).toMatchObject({
      title: "Lab results",
      staff: "Maria Alvarez, RN",
      tab: "labs",
      attention: true,
      detail: "1 of 2 outside the reference range: Glucose 132 mg/dL (high).",
    });
    const orphan = timeline.find(
      (entry) => entry.type === "lab_results" && entry.id !== "lab:draw",
    )!;
    expect(orphan).toMatchObject({
      staff: null,
      detail: "1 of 1 outside the reference range: Hemoglobin 11.2 g/dL (low).",
    });
  });

  it("says when every result of a draw is within range", () => {
    const [entry] = buildTimeline({
      assessments: [],
      incidents: [],
      progress_notes: [],
      lab_results: [{ ...input.lab_results[1], assessment_id: null }],
    });
    expect(entry.detail).toBe("1 result, all within reference range.");
    expect(entry.attention).toBe(false);
  });
});
