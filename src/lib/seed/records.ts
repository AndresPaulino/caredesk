/**
 * The clinical record of each resident, generated from their profile: conditions with the
 * medications the vocabulary pairs them with, allergies with reactions, a medication
 * administration record for the last three days, vitals, assessments with plausible last-done
 * dates, lab results from lab draws, a care plan with goals, incidents, progress notes,
 * appointments, and family contacts.
 *
 * Everything for a former resident stops at the end of their stay. Everything for a current
 * resident stops at the anchor instant.
 */
import { LAB_PANEL_BY_KEY, type LabPanel, type LabTest } from "../clinical/lab-tests";
import { SCHEDULED_HOURS, WEEKLY_DOSE_DAY } from "../clinical/medication-schedule";
import type { Enums } from "../supabase/database.types";

import { asciiSlug, type Organization } from "./organization";
import { stableId, type Random } from "./random";
import type { ResidentProfile } from "./residents";
import {
  GOAL_TEMPLATES,
  appointmentDetails,
  assessmentFindings,
  contactNote,
  incidentDescription,
  medicationInstructions,
  progressNote,
} from "./text";
import { addDays, addMinutes, atZoned, daysBetween, toIso, weekday } from "../time";
import type { ClinicalTable, Seed, SeedRow, SeedStaffMember } from "./types";
import {
  ALLERGY_POOL,
  BACKGROUND_MEDICATIONS,
  CODES,
  NAME_POOLS,
  OBSERVATION_CODES,
  carePlansFor,
  conflictsWithAllergy,
  frequencyFor,
  medicationEntry,
  medicationsTreating,
  percentilesFor,
  quantile,
  type MedicationEntry,
  type Percentiles,
} from "./vocabulary";

export type ClinicalRecords = Pick<Seed, ClinicalTable>;

/** Windows sized so the row counts land on the spec's budget. */
export const ADMINISTRATION_DAYS = 3;
export const DAILY_VITALS_DAYS = 7;
export const WEEKLY_VITALS_WEEKS = 5;
export const PROGRESS_NOTE_DAYS = 30;
export const INCIDENT_WINDOW_DAYS = 180;

type Distributions = {
  systolic: Percentiles;
  diastolic: Percentiles;
  pulse: Percentiles;
  respiratoryRate: Percentiles;
  weightKg: Percentiles;
  morse: Percentiles;
  labs: Map<string, Percentiles>;
};

type Builder = {
  profile: ResidentProfile;
  random: Random;
  resident: SeedRow<"residents">;
  former: boolean;
  anchor: Date;
  anchorDate: string;
  city: string;
  nurse(): SeedStaffMember;
  physician(): SeedStaffMember;
  out: ClinicalRecords;
  distributions: Distributions;
  allergySubstances: string[];
  orders: SeedRow<"medication_orders">[];
};

export function buildRecords(
  profiles: ResidentProfile[],
  org: Organization,
  anchor: Date,
  anchorDate: string,
): ClinicalRecords {
  const out: ClinicalRecords = {
    conditions: [],
    allergies: [],
    medication_orders: [],
    administrations: [],
    vitals: [],
    assessments: [],
    lab_results: [],
    care_plans: [],
    care_plan_goals: [],
    incidents: [],
    progress_notes: [],
    appointments: [],
    family_contacts: [],
  };

  const labs = new Map<string, Percentiles>();
  for (const panel of LAB_PANEL_BY_KEY.values()) {
    for (const test of panel.tests) labs.set(test.code, percentilesFor(test.code));
  }
  const distributions: Distributions = {
    systolic: percentilesFor(OBSERVATION_CODES.systolic),
    diastolic: percentilesFor(OBSERVATION_CODES.diastolic),
    pulse: percentilesFor(OBSERVATION_CODES.pulse),
    respiratoryRate: percentilesFor(OBSERVATION_CODES.respiratoryRate),
    weightKg: percentilesFor(OBSERVATION_CODES.weightKg),
    morse: percentilesFor(OBSERVATION_CODES.morseFallScale),
    labs,
  };

  for (const profile of profiles) {
    const nurses = org.nursesByUnit.get(profile.unit.id)!;
    const physicians = org.physiciansByFacility.get(profile.facility.id)!;
    const builder: Builder = {
      profile,
      random: profile.random,
      resident: profile.row,
      former: profile.row.status === "former",
      anchor,
      anchorDate,
      city: profile.facility.city,
      nurse: () => profile.random.pick(nurses),
      physician: () => profile.random.pick(physicians),
      out,
      distributions,
      allergySubstances: [],
      orders: [],
    };
    addConditions(builder);
    addAllergies(builder);
    addMedicationOrders(builder);
    addAdministrations(builder);
    addVitals(builder);
    addAssessments(builder);
    addCarePlan(builder);
    addIncidents(builder);
    addProgressNotes(builder);
    addAppointments(builder);
    addFamilyContacts(builder);
  }

  return out;
}

const latest = (a: string, b: string) => (a > b ? a : b);
const earliestDate = (a: string, b: string) => (a < b ? a : b);
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round1 = (value: number) => Math.round(value * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Conditions and allergies
// ---------------------------------------------------------------------------------------------

function addConditions(b: Builder) {
  for (const condition of b.profile.conditions) {
    b.out.conditions.push({
      id: condition.id,
      resident_id: b.resident.id,
      code: condition.entry.code,
      code_system: condition.entry.system,
      description: condition.entry.description,
      onset_date: condition.onset,
      resolved_on: condition.resolvedOn,
    });
  }
}

function addAllergies(b: Builder) {
  const { random, profile } = b;
  const count = random.weighted([0, 1, 2, 3], (n) => [30, 35, 25, 10][n]);
  const chosen = new Set<string>();
  const stayDays = Math.max(1, daysBetween(b.resident.admission_date, profile.activityEndDate));
  for (let i = 0; i < count; i++) {
    const entry = random.weighted(
      ALLERGY_POOL.filter((candidate) => !chosen.has(candidate.code)),
      (candidate) => candidate.weight,
    );
    chosen.add(entry.code);
    const reaction =
      entry.reactions.length > 0
        ? random.weighted(entry.reactions, (candidate) => candidate.weight)
        : null;
    b.out.allergies.push({
      id: stableId(`allergy:${profile.key}:${entry.code}`),
      resident_id: b.resident.id,
      code: entry.code,
      description: entry.description,
      category: entry.category,
      allergy_type: entry.allergyType,
      substance: entry.substance,
      reaction: reaction?.description ?? null,
      severity: reaction?.severity ?? null,
      // Usually documented at admission, sometimes discovered during the stay.
      noted_on: random.chance(0.8)
        ? b.resident.admission_date
        : addDays(b.resident.admission_date, random.int(1, stayDays)),
    });
    if (entry.substance) b.allergySubstances.push(entry.substance);
  }
}

// ---------------------------------------------------------------------------------------------
// Medication orders and administrations
// ---------------------------------------------------------------------------------------------

/** Conditions where a second agent is common. */
const TWO_AGENT_CONDITIONS: readonly string[] = [
  CODES.hypertension,
  CODES.heartFailure,
  CODES.copd,
];
const FRACTURE_CODES: readonly string[] = [CODES.hipFracture, "65966004", "443165006"];

function addMedicationOrders(b: Builder) {
  const { random, profile } = b;
  const end = profile.activityEndDate;
  const admission = b.resident.admission_date;
  const conflicts = (medication: MedicationEntry) =>
    b.allergySubstances.some((substance) =>
      conflictsWithAllergy(medication.description, substance),
    );

  let n = 0;
  const push = (
    medication: MedicationEntry,
    conditionId: string | null,
    startedOn: string,
    endedOn: string | null,
  ) => {
    // Nothing stays active past the end of a stay, and no order ends before it starts.
    if (b.former && (endedOn === null || endedOn > end)) endedOn = end;
    if (endedOn !== null && endedOn < startedOn) endedOn = startedOn;
    const row: SeedRow<"medication_orders"> = {
      id: stableId(`order:${profile.key}:${n++}`),
      resident_id: b.resident.id,
      code: medication.code,
      code_system: medication.system,
      medication: medication.description,
      frequency: frequencyFor(medication),
      instructions: medicationInstructions(random, medication.description),
      condition_id: conditionId,
      prescribed_by: b.physician().id,
      started_on: startedOn,
      ended_on: endedOn,
      status: endedOn === null ? "active" : "discontinued",
    };
    b.out.medication_orders.push(row);
    b.orders.push(row);
  };

  for (const condition of profile.conditions) {
    const options = medicationsTreating(condition.entry.code).filter(
      (medication) => !conflicts(medication),
    );
    if (options.length === 0) continue;

    if (condition.entry.chronic) {
      const twoAgents =
        TWO_AGENT_CONDITIONS.includes(condition.entry.code) &&
        options.length > 1 &&
        random.chance(0.35);
      for (const medication of random.sample(options, twoAgents ? 2 : 1)) {
        const startedOn = latest(condition.onset, addDays(end, -random.int(30, 1000)));
        push(medication, condition.id, startedOn, null);
        // Many long-standing orders replaced an earlier one for the same condition.
        if (random.chance(0.45)) {
          const alternatives = options.filter((candidate) => candidate.code !== medication.code);
          const previous = alternatives.length > 0 ? random.pick(alternatives) : medication;
          const previousStart = latest(condition.onset, addDays(startedOn, -random.int(90, 720)));
          push(previous, condition.id, previousStart, startedOn);
        }
      }
    } else {
      // An acute condition gets a short course from its onset.
      const courseDays = FRACTURE_CODES.includes(condition.entry.code)
        ? random.int(14, 30)
        : random.int(5, 10);
      const endedOn = addDays(condition.onset, courseDays);
      push(random.pick(options), condition.id, condition.onset, endedOn <= end ? endedOn : null);
    }
  }

  // Recurrent urinary tract infection: earlier antibiotic courses during the stay.
  const recurrentUti = profile.conditions.find((c) => c.entry.code === CODES.recurrentUti);
  if (recurrentUti) {
    const options = medicationsTreating(CODES.cystitis).filter((m) => !conflicts(m));
    for (let i = 0, courses = random.int(1, 2); i < courses && options.length > 0; i++) {
      const startedOn = addDays(end, -random.int(40, 360));
      if (startedOn < admission) continue;
      push(random.pick(options), recurrentUti.id, startedOn, addDays(startedOn, 7));
    }
  }

  // Maintenance medications the vocabulary lists without a treating condition.
  for (const rule of BACKGROUND_MEDICATIONS) {
    const gateOpen = !rule.requiresAny || profile.hasAny(rule.requiresAny);
    const probability = gateOpen ? rule.probability : (rule.otherwise ?? 0);
    if (!random.chance(probability)) continue;
    const medication = medicationEntry(rule.code);
    if (conflicts(medication)) continue;
    if (
      rule.unlessTaking &&
      b.orders.some((order) => order.ended_on === null && rule.unlessTaking!.test(order.medication))
    ) {
      continue;
    }
    push(medication, null, latest(admission, addDays(end, -random.int(30, 900))), null);
  }
}

function addAdministrations(b: Builder) {
  if (b.former) return;
  const { random, profile } = b;
  // A rolling window ending at the anchor, so the count is the same at any hour of the day.
  const windowStart = addMinutes(b.anchor, -ADMINISTRATION_DAYS * 24 * 60);
  const dementia = profile.has(CODES.dementia);
  let n = 0;

  for (const order of b.orders) {
    if (order.status !== "active") continue;
    for (let daysAgo = ADMINISTRATION_DAYS; daysAgo >= 0; daysAgo--) {
      const date = addDays(b.anchorDate, -daysAgo);
      if (date < order.started_on) continue;
      let hours: readonly number[];
      if (order.frequency === "as_needed") {
        hours = random.chance(0.3) ? [random.int(8, 20)] : [];
      } else if (order.frequency === "weekly") {
        hours = weekday(date) === WEEKLY_DOSE_DAY ? SCHEDULED_HOURS.weekly : [];
      } else {
        hours = SCHEDULED_HOURS[order.frequency];
      }
      for (const hour of hours) {
        const at = atZoned(date, hour, random.int(-15, 30));
        if (at.getTime() > b.anchor.getTime() || at.getTime() < windowStart.getTime()) continue;
        const status = random.weighted(
          ["given", "refused", "held"] as const,
          (candidate) =>
            ({ given: dementia ? 90 : 95, refused: dementia ? 7 : 2, held: 3 })[candidate],
        );
        b.out.administrations.push({
          id: stableId(`administration:${profile.key}:${n++}`),
          resident_id: b.resident.id,
          medication_order_id: order.id,
          administered_at: toIso(at),
          administered_by: b.nurse().id,
          status,
          notes:
            status === "refused"
              ? random.pick([
                  "Refused; will re-offer",
                  "Refused, spat out tablet",
                  "Declined, asleep",
                ])
              : status === "held"
                ? random.pick([
                    `Held: systolic ${random.int(88, 99)}`,
                    "Held: NPO for lab draw",
                    "Held per physician, nausea",
                  ])
                : null,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------------------------

function addVitals(b: Builder) {
  const { random, profile, distributions } = b;
  const admission = b.resident.admission_date;
  const hypertension = profile.has(CODES.hypertension);
  const copd = profile.has(CODES.copd);
  const afib = profile.has(CODES.atrialFibrillation);
  const elderly = profile.ageYears >= 85;

  // A baseline per resident from the vocabulary's distributions, shifted by their conditions.
  const systolicBase =
    quantile(distributions.systolic, random.real(0.15, 0.8)) +
    (hypertension ? 8 : 0) +
    (elderly ? 2 : 0);
  const diastolicBase =
    quantile(distributions.diastolic, random.real(0.15, 0.8)) - (elderly ? 4 : 0);
  const pulseBase = quantile(distributions.pulse, random.real(0.1, 0.85));
  const respiratoryBase =
    quantile(distributions.respiratoryRate, random.real(0.1, 0.9)) + (copd ? 3 : 0);
  const temperatureBase = 97.9 + random.normal(0, 0.3);
  const saturationBase = (copd ? 92.5 : 96.5) + random.normal(0, 1);
  const weightBase =
    quantile(distributions.weightKg, random.real(0.1, 0.9)) *
    2.2046 *
    (profile.row.sex === "female" ? 0.85 : 1) *
    (elderly ? 0.92 : 1);

  const slots: Array<{ date: string; hour: number; weigh: boolean }> = [];
  if (!b.former) {
    for (let daysAgo = 0; daysAgo < DAILY_VITALS_DAYS; daysAgo++) {
      const date = addDays(b.anchorDate, -daysAgo);
      slots.push({ date, hour: 7, weigh: weekday(date) === 1 });
      if (random.chance(0.2)) slots.push({ date, hour: 14, weigh: false });
    }
    for (let week = 1; week <= WEEKLY_VITALS_WEEKS; week++) {
      const date = addDays(b.anchorDate, -(DAILY_VITALS_DAYS + (week - 1) * 7 + random.int(0, 6)));
      slots.push({ date, hour: 7, weigh: true });
    }
  } else {
    for (let week = 0; week < 4; week++) {
      slots.push({
        date: addDays(profile.activityEndDate, -(week * 7 + random.int(0, 6))),
        hour: 7,
        weigh: true,
      });
    }
  }

  let n = 0;
  for (const slot of slots) {
    if (slot.date < admission) continue;
    const at = atZoned(slot.date, slot.hour, 30 + random.int(0, 20));
    if (at.getTime() > profile.activityEnd.getTime()) continue;

    let systolic = systolicBase + random.normal(0, 7);
    let diastolic = diastolicBase + random.normal(0, 5);
    let pulse = pulseBase + random.normal(0, afib ? 12 : 5);
    let temperature = temperatureBase + random.normal(0, 0.3);
    let respiratory = respiratoryBase + random.normal(0, 1.5);
    let saturation = saturationBase + random.normal(0, 1.3);
    let notes: string | null = null;

    // A small share of readings are the excursions the dashboard exists to surface.
    if (random.chance(0.04)) {
      switch (random.pick(["fever", "hypotension", "hypertension", "tachycardia", "hypoxia"])) {
        case "fever":
          temperature += random.real(2, 3.5);
          pulse += 15;
          notes = "Warm to touch; physician notified, acetaminophen given.";
          break;
        case "hypotension":
          systolic -= 28;
          diastolic -= 15;
          pulse += 10;
          notes = "Reports dizziness on standing; assisted to bed, fluids encouraged.";
          break;
        case "hypertension":
          systolic += 38;
          diastolic += 15;
          notes = "Recheck in one hour; physician notified.";
          break;
        case "tachycardia":
          pulse += 35;
          notes = "Irregular rapid pulse; resting, will recheck.";
          break;
        case "hypoxia":
          saturation -= 7;
          respiratory += 6;
          notes = "Short of breath at rest; oxygen applied at 2 liters, physician notified.";
          break;
      }
    }

    b.out.vitals.push({
      id: stableId(`vitals:${profile.key}:${n++}`),
      resident_id: b.resident.id,
      taken_at: toIso(at),
      taken_by: b.nurse().id,
      systolic: clamp(Math.round(systolic), 60, 240),
      diastolic: clamp(Math.round(diastolic), 35, 140),
      pulse: clamp(Math.round(pulse), 35, 180),
      temperature_f: round1(clamp(temperature, 94, 105)),
      respiratory_rate: clamp(Math.round(respiratory), 8, 40),
      oxygen_saturation: clamp(Math.round(saturation), 75, 100),
      weight_lb: slot.weigh ? round1(clamp(weightBase + random.normal(0, 1.5), 70, 400)) : null,
      notes,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Assessments and lab results
// ---------------------------------------------------------------------------------------------

const PHYSICIAN_KINDS: readonly Enums<"assessment_kind">[] = [
  "physician_visit",
  "podiatry",
  "dental",
  "vision",
];

function addAssessments(b: Builder) {
  const { random, profile } = b;
  const end = profile.activityEndDate;
  const admission = b.resident.admission_date;
  const counts = new Map<Enums<"assessment_kind">, number>();
  let n = 0;

  const push = (
    kind: Enums<"assessment_kind">,
    date: string,
    hour: number,
    extra: { panelName?: string } = {},
  ): SeedRow<"assessments"> | null => {
    if (date < admission || date > end) return null;
    const at = atZoned(date, hour, random.int(0, 45));
    if (at.getTime() > profile.activityEnd.getTime()) return null;
    const score = kind === "fall_risk" ? fallRiskScore(b) : null;
    const row: SeedRow<"assessments"> = {
      id: stableId(`assessment:${profile.key}:${n++}`),
      resident_id: b.resident.id,
      kind,
      performed_at: toIso(at),
      performed_by: (PHYSICIAN_KINDS.includes(kind) ? b.physician() : b.nurse()).id,
      findings: assessmentFindings(random, kind, profile.context, {
        score: score ?? undefined,
        ...extra,
      }),
      score,
    };
    b.out.assessments.push(row);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return row;
  };

  /** A run of assessments back from a recent one, at roughly the kind's interval. */
  const series = (
    kind: Enums<"assessment_kind">,
    recent: [number, number],
    step: [number, number],
    horizonDays: number,
    max: number,
    hour: number,
    onEach?: (row: SeedRow<"assessments">, date: string) => void,
  ) => {
    const oldest = addDays(end, -horizonDays);
    let date = addDays(end, -random.int(recent[0], recent[1]));
    for (let i = 0; i < max && date >= oldest; i++) {
      const row = kind === "lab_draw" ? pushLabDraw(b, push, date, hour) : push(kind, date, hour);
      if (row && onEach) onEach(row, date);
      date = addDays(date, -random.int(step[0], step[1]));
    }
  };

  // Each "recent" window runs a little past the kind's due interval, so a few residents are
  // overdue for something: about a fifth of them, for the dashboard to show.
  series("physician_visit", [0, 64], [50, 70], 130, 3, 10);
  series("nursing_assessment", [0, 95], [80, 100], 200, 3, 9);
  series("fall_risk", [0, 95], [80, 100], 200, 3, 9);
  series("lab_draw", [0, 95], [80, 100], 200, 1, 6);

  // A resident admitted recently was assessed on arrival.
  if (!counts.get("nursing_assessment")) push("nursing_assessment", admission, 11);
  if (!counts.get("fall_risk")) push("fall_risk", admission, 11);
  if (!counts.get("physician_visit")) {
    push("physician_visit", earliestDate(addDays(admission, random.int(0, 3)), end), 10);
  }
  if (!counts.get("lab_draw")) {
    pushLabDraw(b, push, earliestDate(addDays(admission, random.int(0, 7)), end), 6);
  }

  if (profile.has(CODES.diabetes) || random.chance(0.55)) {
    push("podiatry", addDays(end, -random.int(0, 96)), 13);
  }
  if (random.chance(0.35)) push("dental", addDays(end, -random.int(0, 400)), 11);
  if (random.chance(0.35)) push("vision", addDays(end, -random.int(0, 400)), 14);
  if (profile.has(CODES.pressureInjury)) {
    for (let week = 0; week < 4; week++) {
      push("wound_check", addDays(end, -(week * 7 + random.int(0, 6))), 10);
    }
  }
}

function fallRiskScore(b: Builder): number {
  const ranges: Record<Enums<"mobility">, [number, number]> = {
    independent: [0.05, 0.4],
    cane: [0.2, 0.6],
    walker: [0.4, 0.85],
    wheelchair: [0.45, 0.9],
    one_person_assist: [0.5, 0.95],
    two_person_assist: [0.5, 0.95],
    bedbound: [0.1, 0.5],
  };
  const [low, high] = ranges[b.resident.mobility];
  const score = quantile(b.distributions.morse, b.random.real(low, high));
  return clamp(Math.round(score), 0, 125);
}

/** One lab draw and the results it produced: one panel, plus an INR for residents on warfarin. */
function pushLabDraw(
  b: Builder,
  push: (
    kind: Enums<"assessment_kind">,
    date: string,
    hour: number,
    extra?: { panelName?: string },
  ) => SeedRow<"assessments"> | null,
  date: string,
  hour: number,
): SeedRow<"assessments"> | null {
  const { random, profile } = b;
  const diabetes = profile.has(CODES.diabetes);
  const lipidsLikely =
    profile.has(CODES.hyperlipidemia) || profile.hasAny([CODES.ischemicHeartDisease]);
  const panelKey: LabPanel["key"] =
    diabetes && random.chance(0.35)
      ? "a1c"
      : random.weighted(
          ["metabolic", "blood_count", "lipids"] as const,
          (key) => ({ metabolic: 55, blood_count: 30, lipids: lipidsLikely ? 15 : 5 })[key],
        );
  const panels = [LAB_PANEL_BY_KEY.get(panelKey)!];
  const onWarfarin = b.orders.some(
    (order) => order.status === "active" && /warfarin/i.test(order.medication),
  );
  if (onWarfarin) panels.push(LAB_PANEL_BY_KEY.get("inr")!);

  const draw = push("lab_draw", date, hour, {
    panelName: panels.map((panel) => panel.name).join(" and "),
  });
  if (!draw) return null;

  let resultedAt = addMinutes(new Date(draw.performed_at), random.int(4 * 60, 30 * 60));
  if (resultedAt.getTime() > profile.activityEnd.getTime()) {
    resultedAt = addMinutes(profile.activityEnd, -random.int(1, 60));
  }
  for (const panel of panels) {
    for (const test of panel.tests) {
      const value = quantile(
        b.distributions.labs.get(test.code)!,
        labQuantile(b, test, onWarfarin),
      );
      b.out.lab_results.push({
        id: stableId(`lab:${profile.key}:${draw.id}:${test.code}`),
        resident_id: b.resident.id,
        assessment_id: draw.id,
        code: test.code,
        code_system: "LOINC",
        description: test.description,
        value: Number(value.toFixed(test.decimals)),
        units: test.units,
        reference_low: test.referenceLow,
        reference_high: test.referenceHigh,
        resulted_at: toIso(resultedAt),
      });
    }
  }
  return draw;
}

/** Where in the vocabulary's distribution a result falls, given the resident's conditions. */
function labQuantile(b: Builder, test: LabTest, onWarfarin: boolean): number {
  const { random, profile } = b;
  switch (test.code) {
    case "2339-0": // glucose
      return profile.has(CODES.diabetes) ? random.real(0.6, 0.995) : random.real(0.05, 0.9);
    case "4548-4": // hemoglobin A1c
      return profile.has(CODES.diabetes) ? random.real(0.75, 0.995) : random.real(0.1, 0.9);
    case "38483-4": // creatinine
      if (profile.hasAny([CODES.ckdStage4, CODES.endStageRenalDisease]))
        return random.real(0.6, 0.9);
      if (profile.has(CODES.ckdStage3)) return random.real(0.45, 0.65);
      return random.real(0.08, 0.42);
    case "718-7": // hemoglobin
      return profile.has(CODES.anemia) ? random.real(0, 0.2) : random.real(0.15, 0.95);
    case "6301-6": // INR
      return onWarfarin ? random.real(0.86, 0.99) : random.real(0.1, 0.7);
    case "2093-3":
    case "2571-8":
    case "18262-6": // lipids
      return profile.has(CODES.hyperlipidemia) ? random.real(0.5, 0.97) : random.real(0.05, 0.8);
    default:
      return random.real(0.03, 0.97);
  }
}

// ---------------------------------------------------------------------------------------------
// Care plans
// ---------------------------------------------------------------------------------------------

/** Which condition a resident's single care plan addresses, most consequential first. */
const CARE_PLAN_PRIORITY: readonly string[] = [
  CODES.dementia,
  CODES.heartFailure,
  CODES.endStageRenalDisease,
  CODES.pressureInjury,
  CODES.hipFracture,
  "65966004",
  "443165006",
  CODES.diabetes,
  CODES.copd,
  "126906006",
  "363406005",
  CODES.depression,
  CODES.hypertension,
  "239873007",
  "239872002",
  "201834006",
  CODES.hyperlipidemia,
  CODES.obesity,
];

function addCarePlan(b: Builder) {
  const { random, profile } = b;
  const end = profile.activityEndDate;
  const candidates = profile.conditions
    .filter((condition) => CARE_PLAN_PRIORITY.includes(condition.entry.code))
    .sort(
      (a, b) => CARE_PLAN_PRIORITY.indexOf(a.entry.code) - CARE_PLAN_PRIORITY.indexOf(b.entry.code),
    );
  const condition = candidates.find((candidate) => carePlansFor(candidate.entry.code).length > 0);
  if (!condition || !random.chance(0.75)) return;

  const plan = carePlansFor(condition.entry.code)[0];
  const startedOn = earliestDate(
    addDays(latest(b.resident.admission_date, condition.onset), random.int(0, 30)),
    end,
  );
  const planId = stableId(`care-plan:${profile.key}`);
  b.out.care_plans.push({
    id: planId,
    resident_id: b.resident.id,
    code: plan.code,
    description: plan.description,
    condition_id: condition.id,
    started_on: startedOn,
    ended_on: b.former ? end : null,
    status: b.former ? "completed" : "active",
  });

  const templates = GOAL_TEMPLATES[plan.code];
  const goals = random.sample(templates, Math.min(templates.length, random.int(2, 3)));
  goals.forEach((goal, index) => {
    const targetDate = addDays(startedOn, random.int(30, 180));
    const status: Enums<"care_plan_goal_status"> =
      targetDate < end
        ? random.weighted(
            ["met", "not_met", "in_progress"] as const,
            (candidate) => ({ met: 55, not_met: 20, in_progress: 25 })[candidate],
          )
        : "in_progress";
    b.out.care_plan_goals.push({
      id: stableId(`care-plan-goal:${profile.key}:${index}`),
      resident_id: b.resident.id,
      care_plan_id: planId,
      description: goal.goal,
      intervention: goal.intervention,
      target_date: targetDate,
      status,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------------------------

const FALL_FACTOR: Record<Enums<"mobility">, number> = {
  independent: 0.5,
  cane: 0.9,
  walker: 1.4,
  wheelchair: 1.2,
  one_person_assist: 1.0,
  two_person_assist: 0.8,
  bedbound: 0.2,
};

function poisson(random: Random, rate: number): number {
  if (rate <= 0) return 0;
  let k = 0;
  let probability = Math.exp(-rate);
  let cumulative = probability;
  const u = random.next();
  while (u > cumulative && k < 20) {
    k += 1;
    probability *= rate / k;
    cumulative += probability;
  }
  return k;
}

function addIncidents(b: Builder) {
  const { random, profile } = b;
  const end = profile.activityEndDate;
  const windowDays = Math.min(INCIDENT_WINDOW_DAYS, daysBetween(b.resident.admission_date, end));
  if (windowDays <= 0) return;
  const scale = windowDays / INCIDENT_WINDOW_DAYS;
  const dementia = profile.has(CODES.dementia);

  const plan: Array<[Enums<"incident_kind">, number]> = [
    [
      "fall",
      poisson(random, 0.55 * FALL_FACTOR[b.resident.mobility] * (dementia ? 1.6 : 1) * scale),
    ],
    ["behavioral", poisson(random, 0.1 * (dementia ? 5 : 1) * scale)],
    ["medication_error", poisson(random, 0.06 * scale)],
  ];

  let n = 0;
  for (const [kind, count] of plan) {
    for (let i = 0; i < count; i++) {
      const date = addDays(end, -random.int(0, windowDays));
      const hour =
        kind === "fall"
          ? random.chance(0.4)
            ? random.pick([22, 23, 0, 1, 2, 3, 4, 5, 6])
            : random.int(7, 21)
          : kind === "medication_error"
            ? random.pick([9, 13, 17, 21])
            : random.int(15, 22);
      const at = atZoned(date, hour, random.int(0, 59));
      if (at.getTime() > profile.activityEnd.getTime()) continue;
      const order = b.orders.find((candidate) => candidate.status === "active") ?? b.orders[0];
      const { description, injury } = incidentDescription(random, kind, profile.context, {
        hour,
        medication: order?.medication,
      });
      b.out.incidents.push({
        id: stableId(`incident:${profile.key}:${n++}`),
        resident_id: b.resident.id,
        kind,
        occurred_at: toIso(at),
        description,
        injury_sustained: injury,
        reported_by: b.nurse().id,
      });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Progress notes
// ---------------------------------------------------------------------------------------------

const SHIFTS = [
  { shift: "night", hour: 6, minute: 45 },
  { shift: "day", hour: 14, minute: 45 },
  { shift: "evening", hour: 22, minute: 45 },
] as const;

function addProgressNotes(b: Builder) {
  const { random, profile } = b;
  const end = profile.activityEndDate;
  const admission = b.resident.admission_date;
  const stayDays = Math.max(0, daysBetween(admission, end));
  const admitted = atZoned(admission, 0, 0);
  let n = 0;

  const push = (daysAgo: number) => {
    const slot = random.pick(SHIFTS);
    const at = atZoned(addDays(end, -daysAgo), slot.hour, slot.minute + random.int(-10, 10));
    if (at.getTime() > profile.activityEnd.getTime() || at.getTime() < admitted.getTime()) return;
    b.out.progress_notes.push({
      id: stableId(`note:${profile.key}:${n++}`),
      resident_id: b.resident.id,
      written_by: b.nurse().id,
      written_at: toIso(at),
      body: progressNote(random, profile.context, slot.shift),
    });
  };

  const busy = profile.has(CODES.dementia) || profile.has(CODES.heartFailure);
  const recent = b.former ? 3 : random.int(3, 5) + (busy ? 1 : 0);
  for (let i = 0; i < recent; i++) push(random.int(0, Math.min(PROGRESS_NOTE_DAYS, stayDays)));
  if (!b.former) {
    for (let month = 1; month <= 2; month++) {
      const daysAgo = 30 * month + random.int(0, 29);
      if (daysAgo > stayDays) break;
      push(daysAgo);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------------------------

function addAppointments(b: Builder) {
  const { random, profile } = b;
  const end = profile.activityEndDate;
  const admission = b.resident.admission_date;
  const stayDays = Math.max(0, daysBetween(admission, end));
  let n = 0;

  const push = (kind: Enums<"appointment_kind">, at: Date, status: Enums<"appointment_status">) => {
    const { location, purpose } = appointmentDetails(random, kind, b.city, profile.context);
    b.out.appointments.push({
      id: stableId(`appointment:${profile.key}:${n++}`),
      resident_id: b.resident.id,
      kind,
      scheduled_at: toIso(at),
      location,
      purpose,
      status,
      scheduled_by: b.nurse().id,
    });
  };
  const pickKind = () =>
    random.weighted(
      ["specialist", "imaging", "hospital", "dental", "other"] as const,
      (kind) => ({ specialist: 45, imaging: 20, hospital: 12, dental: 8, other: 15 })[kind],
    );
  const clockTime = (date: string) =>
    atZoned(date, random.int(8, 15), random.pick([0, 15, 30, 45]));

  // Dialysis three mornings a week, two weeks back and (for current residents) two weeks ahead.
  if (profile.has(CODES.endStageRenalDisease)) {
    for (let offset = -14; offset <= (b.former ? 0 : 14); offset++) {
      const date = addDays(end, offset);
      if (![1, 3, 5].includes(weekday(date)) || date < admission) continue;
      const at = atZoned(date, 7, 0);
      push(
        "dialysis",
        at,
        at.getTime() <= profile.activityEnd.getTime() ? "completed" : "scheduled",
      );
    }
  }

  if (stayDays >= 5 && random.chance(0.7)) {
    push(pickKind(), clockTime(addDays(end, -random.int(5, Math.min(120, stayDays)))), "completed");
  }
  if (!b.former && random.chance(0.55)) {
    const at = clockTime(addDays(b.anchorDate, random.int(0, 21)));
    if (at.getTime() > b.anchor.getTime()) push(pickKind(), at, "scheduled");
  }
  if (random.chance(0.08)) {
    const date = b.former
      ? addDays(end, -random.int(1, Math.max(1, Math.min(60, stayDays))))
      : addDays(b.anchorDate, random.int(-60, 14));
    if (date >= admission) push(pickKind(), clockTime(date), "cancelled");
  }
}

// ---------------------------------------------------------------------------------------------
// Family contacts
// ---------------------------------------------------------------------------------------------

const AREA_CODES = ["617", "508", "413", "978", "781", "339", "351", "774", "857"];

function addFamilyContacts(b: Builder) {
  const { random, profile } = b;
  const count = random.weighted([1, 2, 3], (n) => [35, 45, 20][n - 1]);
  let spouseUsed = false;

  for (let i = 0; i < count; i++) {
    const relationship = random.weighted(
      [
        "spouse",
        "daughter",
        "son",
        "sibling",
        "grandchild",
        "niece_or_nephew",
        "friend",
        "guardian",
        "other",
      ] as const satisfies readonly Enums<"family_relationship">[],
      (candidate) =>
        ({
          spouse: spouseUsed ? 0 : profile.ageYears >= 90 ? 5 : 15,
          daughter: 35,
          son: 25,
          sibling: 5,
          grandchild: 8,
          niece_or_nephew: 5,
          friend: 3,
          guardian: 2,
          other: 2,
        })[candidate],
    );
    if (relationship === "spouse") spouseUsed = true;

    const sex: "female" | "male" =
      relationship === "daughter"
        ? "female"
        : relationship === "son"
          ? "male"
          : relationship === "spouse"
            ? profile.row.sex === "female"
              ? "male"
              : "female"
            : random.chance(0.5)
              ? "female"
              : "male";
    const firstName = random.pick(sex === "female" ? NAME_POOLS.female : NAME_POOLS.male);
    const sharesSurname =
      relationship === "spouse" ||
      relationship === "son" ||
      (relationship === "daughter" && random.chance(0.45)) ||
      (relationship === "sibling" && random.chance(0.7)) ||
      (relationship === "grandchild" && random.chance(0.5));
    const lastName = sharesSurname ? profile.row.last_name : random.pick(NAME_POOLS.last);

    b.out.family_contacts.push({
      id: stableId(`contact:${profile.key}:${i}`),
      resident_id: b.resident.id,
      first_name: firstName,
      last_name: lastName,
      relationship,
      phone: `(${random.pick(AREA_CODES)}) 555-01${String(random.int(0, 99)).padStart(2, "0")}`,
      email: random.chance(0.55)
        ? `${asciiSlug(`${firstName}.${lastName}`)}${random.int(1, 99)}@example.com`
        : null,
      is_primary: i === 0,
      notes: contactNote(random, relationship),
    });
  }
}
