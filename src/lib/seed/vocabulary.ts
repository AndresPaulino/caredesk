/**
 * The clinical vocabulary the generator draws from (ADR 0002), read from the committed catalogs
 * under `data/vocabulary/` and narrowed to what belongs on a care-home resident's record.
 *
 * The catalogs supply codes, names, chronic flags, condition-to-medication pairings, allergy
 * reactions, and value distributions. This module decides which entries to use and how often:
 * Synthea's prevalence describes a general elderly population, not residents of a nursing
 * home, so the care-home prevalence of each condition is set here. Nothing here edits the
 * catalogs; regenerate them with the extraction script if the vocabulary itself must change.
 */
import allergiesCatalog from "../../../data/vocabulary/allergies.json" with { type: "json" };
import carePlansCatalog from "../../../data/vocabulary/careplans.json" with { type: "json" };
import conditionsCatalog from "../../../data/vocabulary/conditions.json" with { type: "json" };
import demographics from "../../../data/vocabulary/demographics.json" with { type: "json" };
import medicationsCatalog from "../../../data/vocabulary/medications.json" with { type: "json" };
import observationsCatalog from "../../../data/vocabulary/observations.json" with { type: "json" };
import { conflictsWithAllergy } from "../clinical/allergy-conflicts";
import type { MedicationFrequency } from "../clinical/medication-schedule";
import type { Enums } from "../supabase/database.types";

import { GOAL_TEMPLATES } from "./text";

type CatalogCondition = {
  code: string;
  system: string;
  description: string;
  patients_active: number;
  chronic: boolean;
};

type CatalogMedication = {
  code: string;
  system: string;
  description: string;
  patients: number;
  reasons: Array<{ code: string; description: string; orders: number }>;
};

type CatalogAllergy = {
  code: string;
  description: string;
  category: string;
  type: string;
  patients: number;
  reactions: Array<{ code: string; description: string; severity: string; count: number }>;
};

type CatalogObservation = {
  code: string;
  description: string;
  units: string;
  type: string;
  numeric?: Percentiles;
};

type CatalogCarePlan = {
  code: string;
  description: string;
  reasons: Array<{ code: string; description: string; count: number }>;
};

const conditions = conditionsCatalog as CatalogCondition[];
const medications = medicationsCatalog as CatalogMedication[];
const allergies = allergiesCatalog as CatalogAllergy[];
const observations = observationsCatalog as CatalogObservation[];
const carePlans = carePlansCatalog as CatalogCarePlan[];

/** Catalog descriptions carry SNOMED semantic tags and doubled spaces; records show neither. */
export function displayName(description: string): string {
  return description
    .replace(
      /\s*\((disorder|finding|situation|procedure|regime\/therapy|record artifact|substance|organism|morphologic abnormality)\)$/,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------

export type ConditionEntry = {
  code: string;
  system: string;
  description: string;
  chronic: boolean;
};

export type ConditionRule = {
  code: string;
  /** Share of residents who carry the condition (of the eligible sex, when one is given). */
  prevalence: number;
  sex?: "female" | "male";
  /** Only alongside at least one of these; diabetic complications need diabetes. */
  requiresAny?: readonly string[];
  /** Overrides the catalog's chronic flag where Synthea's is off for this setting. */
  chronic?: boolean;
};

/** Codes the generator reasons about by name. */
export const CODES = {
  hypertension: "59621000",
  hyperlipidemia: "55822004",
  dementia: "26929004",
  diabetes: "44054006",
  prediabetes: "714628002",
  ischemicHeartDisease: "414545008",
  heartFailure: "88805009",
  atrialFibrillation: "49436004",
  historyOfMi: "399211009",
  historyOfCabg: "399261000",
  osteoporosis: "64859006",
  copd: "185086009",
  depression: "370143000",
  anemia: "271737000",
  hypothyroidism: "83664006",
  ckdStage3: "433144002",
  ckdStage4: "431857002",
  endStageRenalDisease: "46177005",
  recurrentUti: "197927001",
  cystitis: "307426000",
  chronicPain: "82423001",
  lowBackPain: "278860009",
  pressureInjury: "1163220007",
  hipFracture: "359817006",
  smokesTobacco: "449868002",
  obesity: "162864005",
} as const;

export const CARDIAC_CODES: readonly string[] = [
  CODES.ischemicHeartDisease,
  CODES.heartFailure,
  CODES.atrialFibrillation,
  CODES.historyOfMi,
  CODES.historyOfCabg,
];

/**
 * Care-home prevalence, applied in order so a rule can depend on an earlier one. Values are
 * chosen so a resident carries about four conditions on average.
 */
export const CONDITION_RULES: readonly ConditionRule[] = [
  { code: CODES.hypertension, prevalence: 0.5 },
  { code: CODES.hyperlipidemia, prevalence: 0.28 },
  { code: CODES.dementia, prevalence: 0.27 },
  { code: CODES.diabetes, prevalence: 0.22 },
  { code: CODES.prediabetes, prevalence: 0.07 },
  { code: CODES.ischemicHeartDisease, prevalence: 0.15 },
  { code: CODES.heartFailure, prevalence: 0.13 },
  { code: CODES.atrialFibrillation, prevalence: 0.13 },
  { code: CODES.historyOfMi, prevalence: 0.06 },
  { code: CODES.historyOfCabg, prevalence: 0.04 },
  { code: CODES.osteoporosis, prevalence: 0.18 },
  { code: "239873007", prevalence: 0.11 }, // Osteoarthritis of knee
  { code: "239872002", prevalence: 0.06 }, // Osteoarthritis of hip
  { code: "201834006", prevalence: 0.04 }, // Osteoarthritis of the hand
  { code: CODES.ckdStage3, prevalence: 0.1 },
  { code: CODES.ckdStage4, prevalence: 0.03, chronic: true },
  { code: CODES.endStageRenalDisease, prevalence: 0.02 },
  { code: CODES.copd, prevalence: 0.1 },
  { code: CODES.depression, prevalence: 0.15 },
  { code: CODES.anemia, prevalence: 0.12 },
  { code: CODES.hypothyroidism, prevalence: 0.1 },
  { code: "235595009", prevalence: 0.12 }, // Gastroesophageal reflux disease
  { code: CODES.recurrentUti, prevalence: 0.06 },
  { code: "90560007", prevalence: 0.04 }, // Gout
  { code: "128613002", prevalence: 0.03 }, // Seizure disorder
  { code: "84757009", prevalence: 0.015 }, // Epilepsy
  { code: CODES.chronicPain, prevalence: 0.08 },
  { code: CODES.lowBackPain, prevalence: 0.06 },
  { code: "161679004", prevalence: 0.06 }, // History of artificial joint
  { code: CODES.pressureInjury, prevalence: 0.035 },
  { code: "126906006", prevalence: 0.06, sex: "male" }, // Neoplasm of prostate
  { code: "254837009", prevalence: 0.04, sex: "female" }, // Malignant neoplasm of breast
  { code: "39898005", prevalence: 0.05 }, // Sleep disorder
  { code: "78275009", prevalence: 0.03 }, // Obstructive sleep apnea syndrome
  { code: "60573004", prevalence: 0.03 }, // Aortic valve stenosis
  { code: "48724000", prevalence: 0.02 }, // Mitral valve regurgitation
  { code: CODES.obesity, prevalence: 0.1 },
  { code: "69896004", prevalence: 0.025 }, // Rheumatoid arthritis
  { code: "195967001", prevalence: 0.025 }, // Asthma
  { code: "40055000", prevalence: 0.03 }, // Chronic sinusitis
  { code: "302870006", prevalence: 0.03 }, // Hypertriglyceridemia
  { code: CODES.smokesTobacco, prevalence: 0.025 },
  { code: "24079001", prevalence: 0.015 }, // Atopic dermatitis
  { code: "68496003", prevalence: 0.03 }, // Polyp of colon
  { code: "127294003", prevalence: 0.015 }, // Traumatic or nontraumatic brain injury
  { code: "161622006", prevalence: 0.01 }, // History of lower limb amputation
  { code: "15724005", prevalence: 0.015 }, // Fracture of vertebral column
  { code: "93143009", prevalence: 0.008 }, // Leukemia
  { code: "109989006", prevalence: 0.008 }, // Multiple myeloma
  { code: "363406005", prevalence: 0.015 }, // Malignant neoplasm of colon
  { code: "424132000", prevalence: 0.008 }, // Non-small cell carcinoma of lung
  // Diabetic complications.
  { code: "368581000119106", prevalence: 0.3, requiresAny: [CODES.diabetes] }, // Neuropathy
  { code: "1551000119108", prevalence: 0.2, requiresAny: [CODES.diabetes] }, // Retinopathy
  { code: "127013003", prevalence: 0.15, requiresAny: [CODES.diabetes] }, // Diabetic kidney disease
  // Acute conditions: a recent onset, resolved after a short course.
  { code: CODES.cystitis, prevalence: 0.09 },
  { code: "10509002", prevalence: 0.035 }, // Acute bronchitis
  { code: "444814009", prevalence: 0.02 }, // Viral sinusitis
  { code: "75498004", prevalence: 0.015 }, // Acute bacterial sinusitis
  { code: CODES.hipFracture, prevalence: 0.03 },
  { code: "65966004", prevalence: 0.015 }, // Fracture of forearm
  { code: "443165006", prevalence: 0.015 }, // Osteoporotic fracture of bone
];

/** At most one member of each family appears on a record. */
export const EXCLUSIVE_CONDITION_FAMILIES: readonly (readonly string[])[] = [
  [CODES.ckdStage3, CODES.ckdStage4, CODES.endStageRenalDisease],
  [CODES.diabetes, CODES.prediabetes],
  ["128613002", "84757009"], // seizure disorder, epilepsy
  ["39898005", "78275009"], // sleep disorder, obstructive sleep apnea
];

const conditionByCode = new Map(conditions.map((entry) => [entry.code, entry]));

export function conditionEntry(code: string): ConditionEntry {
  const entry = conditionByCode.get(code);
  if (!entry) throw new Error(`Condition ${code} is not in the clinical vocabulary`);
  const rule = CONDITION_RULES.find((candidate) => candidate.code === code);
  return {
    code: entry.code,
    system: entry.system,
    description: displayName(entry.description),
    chronic: rule?.chronic ?? entry.chronic,
  };
}

// ---------------------------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------------------------

export type MedicationEntry = { code: string; system: string; description: string };

/** Chemotherapy, anesthesia, and hospital-only injectables: in the catalog, not in a care home. */
const EXCLUDED_MEDICATION_CODES = new Set([
  "1860480", // docetaxel
  "1803932", // leucovorin
  "1736776", // oxaliplatin
  "1736854", // cisplatin
  "583214", // paclitaxel
  "108515", // tacrolimus injection
  "854252", // enoxaparin (acute clot treatment)
  "856980", // hydrocodone for PTSD
]);

/** Pairings the catalog records that would read wrong on a chart. */
const EXCLUDED_PAIRINGS = new Set([`${CODES.prediabetes}:106892`]); // insulin for prediabetes

const medicationByCode = new Map(medications.map((entry) => [entry.code, entry]));

function toMedicationEntry(entry: CatalogMedication): MedicationEntry {
  return { code: entry.code, system: entry.system, description: displayName(entry.description) };
}

export function medicationEntry(code: string): MedicationEntry {
  const entry = medicationByCode.get(code);
  if (!entry) throw new Error(`Medication ${code} is not in the clinical vocabulary`);
  return toMedicationEntry(entry);
}

/** Every catalog medication that treats the condition, in the catalog's order of prevalence. */
export function medicationsTreating(conditionCode: string): MedicationEntry[] {
  return medications
    .filter(
      (entry) =>
        !EXCLUDED_MEDICATION_CODES.has(entry.code) &&
        !EXCLUDED_PAIRINGS.has(`${conditionCode}:${entry.code}`) &&
        entry.reasons.some((reason) => reason.code === conditionCode),
    )
    .map(toMedicationEntry);
}

export const MEDICATION_CATALOG_CODES: ReadonlySet<string> = new Set(medicationByCode.keys());

export type BackgroundMedicationRule = {
  code: string;
  /** Chance of the order when the gate (if any) is open. */
  probability: number;
  /** Only for residents with at least one of these conditions. */
  requiresAny?: readonly string[];
  /** Chance for residents who fail the gate; omitted means none. */
  otherwise?: number;
  /** Skip when an existing order matches, so two statins or two beta blockers never coexist. */
  unlessTaking?: RegExp;
};

/**
 * Maintenance medications the catalog lists without a treating condition. They are ordered
 * unpaired (no condition on the order) but gated on the conditions that make them plausible.
 */
export const BACKGROUND_MEDICATIONS: readonly BackgroundMedicationRule[] = [
  { code: "243670", probability: 0.55, requiresAny: CARDIAC_CODES, otherwise: 0.12 }, // aspirin 81
  {
    code: "617310", // atorvastatin 20
    probability: 0.4,
    requiresAny: [...CARDIAC_CODES, CODES.hyperlipidemia],
    unlessTaking: /statin/i,
  },
  {
    code: "866436", // metoprolol succinate 50
    probability: 0.35,
    requiresAny: [...CARDIAC_CODES, CODES.hypertension],
    unlessTaking: /olol|carvedilol|verapamil/i,
  },
  {
    code: "309362", // clopidogrel
    probability: 0.3,
    requiresAny: [CODES.ischemicHeartDisease, CODES.historyOfMi, CODES.historyOfCabg],
  },
  {
    code: "705129", // nitroglycerin spray, as needed
    probability: 0.4,
    requiresAny: [CODES.ischemicHeartDisease, CODES.historyOfMi],
  },
  { code: "966222", probability: 0.9, requiresAny: [CODES.hypothyroidism] }, // levothyroxine
  { code: "310325", probability: 0.5, requiresAny: [CODES.anemia] }, // ferrous sulfate
  { code: "2001499", probability: 0.15, requiresAny: [CODES.anemia] }, // vitamin B12 injection
  { code: "209387", probability: 0.6 }, // acetaminophen, as needed
  {
    code: "835603", // tramadol, as needed
    probability: 0.4,
    requiresAny: [CODES.chronicPain, CODES.lowBackPain],
  },
  { code: "1049630", probability: 0.05 }, // diphenhydramine at bedtime
  { code: "198031", probability: 0.7, requiresAny: [CODES.smokesTobacco] }, // nicotine patch
];

const FREQUENCY_BY_CODE: Readonly<Record<string, MedicationFrequency>> = {
  "106892": "twice_daily", // insulin 70/30
  "310436": "twice_daily", // galantamine
  "997223": "at_bedtime", // donepezil
  "204892": "at_bedtime", // clonazepam
  "1049630": "at_bedtime", // diphenhydramine
  "849574": "twice_daily", // naproxen sodium
  "198014": "twice_daily", // naproxen
  "313782": "as_needed", // acetaminophen
  "209387": "as_needed", // acetaminophen [Tylenol]
  "1043400": "as_needed", // cough syrup
  "835603": "as_needed", // tramadol
  "197454": "three_times_daily", // cephalexin
  "897685": "three_times_daily", // verapamil
  "205923": "weekly", // epoetin alfa
  "2001499": "weekly", // vitamin B12 injection
  "904419": "weekly", // alendronate
  "106258": "twice_daily", // hydrocortisone cream
  "245314": "as_needed", // albuterol nebulizer solution
  "630208": "as_needed",
  "351137": "as_needed",
  "745752": "as_needed", // albuterol inhaler
  "2123111": "as_needed",
};

/** How often a medication is given: explicit for the common ones, otherwise from its form. */
export function frequencyFor(medication: MedicationEntry): MedicationFrequency {
  const explicit = FREQUENCY_BY_CODE[medication.code];
  if (explicit) return explicit;
  const name = medication.description.toLowerCase();
  if (name.includes("24 hr") || name.includes("extended release")) return "once_daily";
  if (name.includes("spray") || name.includes("sublingual")) return "as_needed";
  if (name.includes("inhal")) return "twice_daily";
  if (name.includes("injection") || name.includes("syringe")) return "weekly";
  if (name.includes("cream")) return "twice_daily";
  if (/amoxicillin|ciprofloxacin|sulfamethoxazole|nitrofurantoin|doxycycline|penicillin/.test(name))
    return "twice_daily";
  if (/metformin|carvedilol|losartan|lisinopril|amlodipine|hydrochlorothiazide/.test(name))
    return "once_daily";
  return "once_daily";
}

// ---------------------------------------------------------------------------------------------
// Allergies
// ---------------------------------------------------------------------------------------------

export type AllergyReaction = {
  description: string;
  severity: Enums<"allergy_severity">;
  weight: number;
};

export type AllergyEntry = {
  code: string;
  description: string;
  category: Enums<"allergy_category">;
  allergyType: Enums<"allergy_type">;
  /** Lowercase ingredient a medication order's name is matched against; null unless a medication. */
  substance: string | null;
  weight: number;
  reactions: AllergyReaction[];
};

const MEDICATION_ALLERGY_SUBSTANCES: Readonly<Record<string, string>> = {
  "1191": "aspirin",
  "29046": "lisinopril",
  "7984": "penicillin",
  "25037": "cefdinir",
  "5640": "ibuprofen",
  "10831": "sulfamethoxazole",
};

const SEVERITIES: Readonly<Record<string, Enums<"allergy_severity">>> = {
  MILD: "mild",
  MODERATE: "moderate",
  SEVERE: "severe",
};

export const ALLERGY_POOL: readonly AllergyEntry[] = allergies
  // "Allergic disposition" is a trait, not an allergen.
  .filter((entry) => entry.code !== "609328004")
  .map((entry) => ({
    code: entry.code,
    description: displayName(entry.description),
    category: entry.category as Enums<"allergy_category">,
    allergyType: entry.type as Enums<"allergy_type">,
    substance: MEDICATION_ALLERGY_SUBSTANCES[entry.code] ?? null,
    weight: entry.patients,
    reactions: entry.reactions.map((reaction) => ({
      description: displayName(reaction.description),
      severity: SEVERITIES[reaction.severity] ?? "mild",
      weight: reaction.count,
    })),
  }));

// The conflict rule lives with the clinical code so the seed and the resident page agree.
export { conflictsWithAllergy };

// ---------------------------------------------------------------------------------------------
// Care plans
// ---------------------------------------------------------------------------------------------

export type CarePlanEntry = { code: string; description: string };

/** Pairings the catalog lacks because Synthea never attaches these plans to these conditions. */
const EXTRA_CARE_PLAN_REASONS: Readonly<Record<string, readonly string[]>> = {
  "225358003": [CODES.pressureInjury], // Wound care
  "736690008": [CODES.endStageRenalDisease], // Dialysis care plan
  "718361005": [CODES.obesity], // Weight management program
  "737434004": [CODES.depression], // Major depressive disorder clinical management plan
};

/**
 * The care plans that address a condition, limited to plan types this generator can write
 * goals for. Order follows the catalog's prevalence.
 */
export function carePlansFor(conditionCode: string): CarePlanEntry[] {
  return carePlans
    .filter(
      (plan) =>
        plan.code in GOAL_TEMPLATES &&
        (plan.reasons.some((reason) => reason.code === conditionCode) ||
          EXTRA_CARE_PLAN_REASONS[plan.code]?.includes(conditionCode)),
    )
    .map((plan) => ({ code: plan.code, description: displayName(plan.description) }));
}

// ---------------------------------------------------------------------------------------------
// Observations: value distributions
// ---------------------------------------------------------------------------------------------

export type Percentiles = {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
};

const observationByCode = new Map(observations.map((entry) => [entry.code, entry]));

export function percentilesFor(code: string): Percentiles {
  const entry = observationByCode.get(code);
  if (!entry?.numeric) throw new Error(`Observation ${code} has no numeric distribution`);
  return entry.numeric;
}

/**
 * The value at quantile `u` of a catalog distribution, interpolating between the recorded
 * percentiles. Below 0.05 and above 0.95 the nearest segment's slope continues, so a small
 * share of values sit past the recorded tails, the way real readings do.
 */
export function quantile(percentiles: Percentiles, u: number): number {
  const knots: Array<[number, number]> = [
    [0.05, percentiles.p05],
    [0.25, percentiles.p25],
    [0.5, percentiles.p50],
    [0.75, percentiles.p75],
    [0.95, percentiles.p95],
  ];
  const clamped = Math.min(Math.max(u, 0), 1);
  let lower = knots[0];
  let upper = knots[1];
  for (let i = 1; i < knots.length; i++) {
    if (clamped <= knots[i][0] || i === knots.length - 1) {
      lower = knots[i - 1];
      upper = knots[i];
      break;
    }
  }
  const slope = (upper[1] - lower[1]) / (upper[0] - lower[0]);
  return lower[1] + slope * (clamped - lower[0]);
}

export const OBSERVATION_CODES = {
  systolic: "8480-6",
  diastolic: "8462-4",
  pulse: "8867-4",
  respiratoryRate: "9279-1",
  weightKg: "29463-7",
  morseFallScale: "59460-6",
} as const;

// ---------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------

export const NAME_POOLS = {
  female: demographics.first_names.F as readonly string[],
  male: demographics.first_names.M as readonly string[],
  last: demographics.last_names as readonly string[],
} as const;
