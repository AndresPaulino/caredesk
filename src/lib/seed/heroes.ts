/**
 * The hero residents: ten hand-authored residents layered onto the generated population so the
 * demo script always has something to show (spec, user stories 66 and 67). Each is authored as
 * facts rather than rows: who they are, where they live, what is on their record, and the story
 * the record tells. `residents.ts` places them, reserving each one's room before the generated
 * population fills the beds, and `records.ts` turns the facts into rows, letting the generator
 * fill in whatever a story does not pin down: administrations, daily vitals, lab results, and
 * the routine assessments.
 *
 * Every date is relative to the seed's anchor, so a hero is "overdue since last month" or
 * "back from the hospital eleven days ago" on every reseed. Ids derive from the hero's key, so
 * a link to a hero survives a reseed and a change of seed number. Every code is drawn from the
 * clinical vocabulary; `heroes.test.ts` checks that each one resolves.
 */
import type { AssessmentKind } from "../clinical/assessment-kinds";
import type { MedicationFrequency } from "../clinical/medication-schedule";
import type { Enums } from "../supabase/database.types";

import { stableId } from "./random";
import { CODES } from "./vocabulary";

export type HeroKey =
  | "doe-meadows"
  | "doe-harbor"
  | "allergy-conflict"
  | "falls"
  | "readmitted"
  | "dementia"
  | "wound-series"
  | "recently-former"
  | "weight-loss"
  | "unmet-goal";

export type AuthoredCondition = {
  /** SNOMED code from the conditions catalog. */
  code: string;
  onsetDaysAgo: number;
  /** Resolved this many days ago; omitted while the condition is active. */
  resolvedDaysAgo?: number;
};

export type AuthoredAllergy = {
  /** Code from the allergies catalog. */
  code: string;
  /** One of the catalog's reactions for this allergen, with its severity. */
  reaction: string;
  severity: Enums<"allergy_severity">;
  /** Documented this many days ago; omitted means at admission. */
  notedDaysAgo?: number;
};

export type AuthoredOrder = {
  /** RxNorm code from the medications catalog. */
  code: string;
  /** The condition on this record the order treats, when the story pairs them. */
  treats?: string;
  startedDaysAgo: number;
  /** Discontinued this many days ago; omitted means the order is active. */
  endedDaysAgo?: number;
  /** Overrides the frequency the vocabulary implies for the medication. */
  frequency?: MedicationFrequency;
  /** Overrides the generated instructions; null for none. */
  instructions?: string | null;
  /** True for an order entered today with no dose recorded yet. */
  noDosesYet?: boolean;
};

export type AuthoredAssessment = {
  kind: AssessmentKind;
  daysAgo: number;
  /** Hour of the day, in the facilities' time zone. */
  hour?: number;
  /** Overrides the generated findings. */
  findings?: string;
  /** Morse Fall Scale total, for fall-risk assessments. */
  score?: number;
};

export type AuthoredIncident = {
  kind: Enums<"incident_kind">;
  daysAgo: number;
  hour: number;
  description: string;
  injury: boolean;
};

export type Shift = "night" | "day" | "evening";

export type AuthoredNote = {
  daysAgo: number;
  /** The shift the note was written at the end of. */
  shift: Shift;
  body: string;
};

export type AuthoredAppointment = {
  kind: Enums<"appointment_kind">;
  /** Days from today; negative for a past appointment. */
  inDays: number;
  hour: number;
  minute?: number;
  location: string;
  purpose: string;
  status: Enums<"appointment_status">;
};

export type AuthoredContact = {
  firstName: string;
  lastName: string;
  relationship: Enums<"family_relationship">;
  phone: string;
  email?: string;
  isPrimary: boolean;
  notes?: string;
};

export type AuthoredGoal = {
  goal: string;
  intervention: string;
  /** Days from today the goal is or was due; negative once past. */
  targetInDays: number;
  status: Enums<"care_plan_goal_status">;
};

export type AuthoredCarePlan = {
  /** Code from the care plans catalog. */
  code: string;
  /** The condition on this record the plan addresses. */
  treats: string;
  startedDaysAgo: number;
  goals: AuthoredGoal[];
};

export type AuthoredVitals = {
  /** Baseline readings that replace the ones drawn from the vocabulary. */
  systolic?: number;
  diastolic?: number;
  /** A weight trend: today's weight and the change per week leading up to it. */
  weight?: { currentLb: number; changePerWeekLb: number };
};

export type HeroDefinition = {
  key: HeroKey;
  /** One line for the demo script: what this resident's record shows. */
  story: string;
  firstName: string;
  lastName: string;
  sex: "female" | "male";
  dateOfBirth: string;
  facilityCode: string;
  unitCode: string;
  /** The room reserved for a current hero; null for a former resident. */
  roomNumber: string | null;
  admittedDaysAgo: number;
  /** Set for a former resident. */
  stay?: { endedDaysAgo: number; reason: Enums<"stay_end_reason"> };
  codeStatus: Enums<"code_status">;
  diet: Enums<"diet">;
  mobility: Enums<"mobility">;
  conditions: AuthoredCondition[];
  /** The whole allergy list. */
  allergies: AuthoredAllergy[];
  /** The whole medication list, past orders included. */
  medicationOrders: AuthoredOrder[];
  /** Assessments of the kinds listed are authored in full; other kinds are generated. */
  assessments?: AuthoredAssessment[];
  vitals?: AuthoredVitals;
  /** Replaces the generated care plan. */
  carePlan?: AuthoredCarePlan;
  /** When given, the only incidents on the record. */
  incidents?: AuthoredIncident[];
  /** Added to the generated routine notes. */
  progressNotes?: AuthoredNote[];
  /** Added to the generated appointments. */
  appointments?: AuthoredAppointment[];
  /** The whole contact list. */
  familyContacts: AuthoredContact[];
};

/** The id of a hero's resident row, the same on every reseed and every seed number. */
export function heroResidentId(key: HeroKey): string {
  return stableId(`resident:hero:${key}`);
}

// Codes the stories cite that the generator does not name.
const OSTEOARTHRITIS_KNEE = "239873007";
const OSTEOARTHRITIS_HIP = "239872002";
const NEUROPATHY = "368581000119106";
const REFLUX = "235595009";
const ARTIFICIAL_JOINT = "161679004";
const SLEEP_APNEA = "78275009";

const MEDICATIONS = {
  metforminEr: "860975",
  insulin7030: "106892",
  lisinopril10: "314076",
  lisinopril20: "314077",
  losartan25: "979485",
  amlodipine: "308136",
  hydrochlorothiazide: "310798",
  metoprololSuccinate25: "866427",
  furosemide40: "313988",
  warfarin5: "855332",
  simvastatin10: "314231",
  alendronate: "904419",
  donepezilMemantine: "1599803",
  epoetinAlfa: "205923",
  ferrousSulfate: "310325",
  levothyroxine: "966222",
  sertraline: "312938",
  sulfamethoxazoleTrimethoprim: "198335",
  nitrofurantoin: "1648756",
  acetaminophenAsNeeded: "209387",
  tramadolAsNeeded: "835603",
} as const;

const ALLERGENS = {
  penicillin: "7984",
  sulfamethoxazoleTrimethoprim: "10831",
  aspirin: "1191",
  lisinopril: "29046",
  shellfish: "735029006",
  fish: "735971005",
  treeNut: "442571000124108",
  latex: "111088007",
} as const;

const CARE_PLANS = {
  diabetes: "735985000",
  hypertension: "443402002",
  dialysis: "736690008",
  dementia: "386257007",
  heartFailure: "735984001",
  woundCare: "225358003",
  fractureCare: "385691007",
  depression: "737434004",
} as const;

export const HERO_RESIDENTS: readonly HeroDefinition[] = [
  {
    key: "doe-meadows",
    story:
      "Overdue for podiatry and seen by the physician four days ago, so the Meadows nurse's " +
      '"when was Mr. Doe\'s last podiatry exam" has a dated answer.',
    firstName: "Harold",
    lastName: "Doe",
    sex: "male",
    dateOfBirth: "1942-05-17",
    facilityCode: "MDW",
    unitCode: "A",
    roomNumber: "104",
    admittedDaysAgo: 425,
    codeStatus: "dnr",
    diet: "diabetic",
    mobility: "walker",
    conditions: [
      { code: CODES.diabetes, onsetDaysAgo: 4380 },
      { code: CODES.hypertension, onsetDaysAgo: 5475 },
      { code: NEUROPATHY, onsetDaysAgo: 1460 },
      { code: CODES.hyperlipidemia, onsetDaysAgo: 3650 },
      { code: OSTEOARTHRITIS_KNEE, onsetDaysAgo: 2555 },
    ],
    allergies: [{ code: ALLERGENS.penicillin, reaction: "Wheal", severity: "mild" }],
    medicationOrders: [
      { code: MEDICATIONS.metforminEr, treats: CODES.diabetes, startedDaysAgo: 425 },
      { code: MEDICATIONS.lisinopril10, treats: CODES.hypertension, startedDaysAgo: 425 },
      { code: MEDICATIONS.simvastatin10, treats: CODES.hyperlipidemia, startedDaysAgo: 425 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 425 },
    ],
    assessments: [
      {
        kind: "podiatry",
        daysAgo: 131,
        hour: 13,
        findings:
          "Toenails thickened and trimmed bilaterally, calluses debrided from plantar surfaces. " +
          "Diabetic foot exam: pedal pulses palpable, monofilament sensation reduced at the " +
          "forefoot, no ulceration. Return in 90 days.",
      },
      {
        kind: "podiatry",
        daysAgo: 222,
        hour: 13,
        findings:
          "Nails trimmed and filed, mild onychomycosis noted, no treatment indicated. Diabetic " +
          "foot exam: skin intact, pulses present, protective sensation diminished; footwear " +
          "reviewed. Return in 90 days.",
      },
      {
        kind: "physician_visit",
        daysAgo: 4,
        hour: 10,
        findings:
          "Routine visit. Mr. Doe seen in his room, resting comfortably. Lungs clear " +
          "bilaterally, heart regular rate and rhythm, abdomen soft. Fingerstick glucose log " +
          "reviewed; no changes to diabetic regimen. Feet: dry skin, thickened nails, no " +
          "breakdown; podiatry follow-up is overdue, referral placed. Continue current plan of " +
          "care.",
      },
      { kind: "physician_visit", daysAgo: 64, hour: 10 },
      { kind: "physician_visit", daysAgo: 124, hour: 10 },
    ],
    carePlan: {
      code: CARE_PLANS.diabetes,
      treats: CODES.diabetes,
      startedDaysAgo: 420,
      goals: [
        {
          goal: "Fasting blood glucose between 90 and 130 mg/dL",
          intervention:
            "Fingerstick glucose before breakfast and at bedtime; notify physician if above 250 or below 70",
          targetInDays: 45,
          status: "in_progress",
        },
        {
          goal: "Feet inspected daily with no new skin breakdown",
          intervention: "Daily foot check during morning care; podiatry every 90 days",
          targetInDays: -30,
          status: "met",
        },
      ],
    },
    progressNotes: [
      {
        daysAgo: 4,
        shift: "day",
        body:
          "Physician visit this morning; podiatry follow-up noted as overdue and a referral was " +
          "placed. Mr. Doe asked when his feet would be seen. Fingerstick glucose 142 before lunch.",
      },
      {
        daysAgo: 1,
        shift: "evening",
        body:
          "Mr. Doe ate 75 percent of dinner on diabetic diet; evening medications given as " +
          "scheduled. Reports tingling in both feet at bedtime; feet checked, skin intact, " +
          "non-skid socks on.",
      },
    ],
    familyContacts: [
      {
        firstName: "Eleanor",
        lastName: "Doe",
        relationship: "spouse",
        phone: "(978) 555-0142",
        isPrimary: true,
        notes: "Visits every afternoon; holds health care proxy",
      },
      {
        firstName: "Richard",
        lastName: "Doe",
        relationship: "son",
        phone: "(617) 555-0176",
        email: "richard.doe@example.com",
        isPrimary: false,
        notes: "Attends care conferences",
      },
    ],
  },
  {
    key: "doe-harbor",
    story:
      "The other Mr. Doe, at Harbor, so the admin is asked which one: on dialysis three " +
      "mornings a week, with a podiatry exam three weeks ago.",
    firstName: "Walter",
    lastName: "Doe",
    sex: "male",
    dateOfBirth: "1947-02-03",
    facilityCode: "HBR",
    unitCode: "B",
    roomNumber: "212",
    admittedDaysAgo: 240,
    codeStatus: "full_code",
    diet: "renal",
    mobility: "cane",
    conditions: [
      { code: CODES.endStageRenalDisease, onsetDaysAgo: 730 },
      { code: CODES.diabetes, onsetDaysAgo: 5840 },
      { code: CODES.hypertension, onsetDaysAgo: 6570 },
      { code: CODES.anemia, onsetDaysAgo: 600 },
    ],
    allergies: [{ code: ALLERGENS.shellfish, reaction: "Eruption of skin", severity: "moderate" }],
    medicationOrders: [
      { code: MEDICATIONS.insulin7030, treats: CODES.diabetes, startedDaysAgo: 240 },
      { code: MEDICATIONS.amlodipine, treats: CODES.hypertension, startedDaysAgo: 240 },
      { code: MEDICATIONS.epoetinAlfa, treats: CODES.anemia, startedDaysAgo: 200 },
      { code: MEDICATIONS.ferrousSulfate, startedDaysAgo: 200 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 240 },
    ],
    assessments: [
      {
        kind: "podiatry",
        daysAgo: 23,
        hour: 13,
        findings:
          "Nails trimmed; corn on right fifth toe pared, felt padding applied. Diabetic foot " +
          "exam: pedal pulses palpable, monofilament sensation reduced at the forefoot, no " +
          "ulceration. Return in 90 days.",
      },
      {
        kind: "physician_visit",
        daysAgo: 30,
        hour: 10,
        findings:
          "Scheduled visit. Mr. Doe reviewed with charge nurse present. Chest clear, no " +
          "peripheral edema, fistula with good thrill. Post-dialysis weights stable; potassium " +
          "and phosphorus reviewed with the dialysis center. Fingerstick glucose log reviewed; " +
          "continue current diabetic regimen and renal diet. Will follow up next month.",
      },
    ],
    carePlan: {
      code: CARE_PLANS.dialysis,
      treats: CODES.endStageRenalDisease,
      startedDaysAgo: 235,
      goals: [
        {
          goal: "Attends every scheduled dialysis session",
          intervention:
            "Transport booked for Monday, Wednesday, and Friday; pre-dialysis weight recorded",
          targetInDays: 60,
          status: "in_progress",
        },
        {
          goal: "Fistula site without redness or swelling",
          intervention: "Access site checked each shift; no blood pressure on the access arm",
          targetInDays: 60,
          status: "in_progress",
        },
        {
          goal: "Fluid gain between sessions under two kilograms",
          intervention: "Renal diet with fluid restriction; intake recorded each shift",
          targetInDays: -20,
          status: "met",
        },
      ],
    },
    progressNotes: [
      {
        daysAgo: 2,
        shift: "day",
        body:
          "Mr. Doe returned from dialysis at 12:30 pm; fistula site clean and dry with thrill " +
          "present, no bleeding. Tired, napped until lunch was reheated, then ate 75 percent on " +
          "renal diet.",
      },
    ],
    familyContacts: [
      {
        firstName: "Susan",
        lastName: "Doe",
        relationship: "daughter",
        phone: "(978) 555-0117",
        email: "susan.doe@example.com",
        isPrimary: true,
        notes: "Drives him to dialysis when transport is short; holds health care proxy",
      },
      {
        firstName: "Thomas",
        lastName: "Doe",
        relationship: "sibling",
        phone: "(508) 555-0151",
        isPrimary: false,
      },
    ],
  },
  {
    key: "allergy-conflict",
    story:
      "An antibiotic ordered today for a urinary tract infection conflicts with her documented " +
      "sulfamethoxazole allergy; the resident page flags it before the first dose.",
    firstName: "Margaret",
    lastName: "Kowalski",
    sex: "female",
    dateOfBirth: "1938-08-22",
    facilityCode: "MDW",
    unitCode: "B",
    roomNumber: "218",
    admittedDaysAgo: 610,
    codeStatus: "dnr",
    diet: "regular",
    mobility: "walker",
    conditions: [
      { code: CODES.recurrentUti, onsetDaysAgo: 400 },
      { code: CODES.cystitis, onsetDaysAgo: 2 },
      { code: CODES.hypertension, onsetDaysAgo: 4000 },
      { code: CODES.osteoporosis, onsetDaysAgo: 2900 },
    ],
    allergies: [
      {
        code: ALLERGENS.sulfamethoxazoleTrimethoprim,
        reaction: "Eruption of skin",
        severity: "moderate",
      },
    ],
    medicationOrders: [
      {
        code: MEDICATIONS.sulfamethoxazoleTrimethoprim,
        treats: CODES.cystitis,
        startedDaysAgo: 0,
        instructions: "Seven-day course for urinary tract infection",
        noDosesYet: true,
      },
      {
        code: MEDICATIONS.nitrofurantoin,
        treats: CODES.recurrentUti,
        startedDaysAgo: 41,
        endedDaysAgo: 34,
      },
      { code: MEDICATIONS.amlodipine, treats: CODES.hypertension, startedDaysAgo: 610 },
      { code: MEDICATIONS.alendronate, treats: CODES.osteoporosis, startedDaysAgo: 600 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 610 },
    ],
    assessments: [
      {
        kind: "physician_visit",
        daysAgo: 1,
        hour: 15,
        findings:
          "Seen for dysuria, urinary frequency, and a temperature of 99.4 since yesterday. " +
          "Abdomen soft, mild suprapubic tenderness, no flank pain. Urinalysis sent; will start " +
          "an antibiotic once the result is back. Encourage fluids.",
      },
      { kind: "physician_visit", daysAgo: 55, hour: 10 },
    ],
    progressNotes: [
      {
        daysAgo: 1,
        shift: "evening",
        body:
          "Mrs. Kowalski complained of burning with urination and frequency through the " +
          "afternoon; temperature 99.4. Physician saw her at 3 pm and sent a urinalysis. " +
          "Fluids encouraged; drinking well.",
      },
      {
        daysAgo: 0,
        shift: "night",
        body:
          "Urinalysis reported positive for infection overnight. Physician ordered " +
          "sulfamethoxazole/trimethoprim twice daily for seven days; order entered, first dose " +
          "due this evening. Slept well, no fever.",
      },
    ],
    familyContacts: [
      {
        firstName: "Anna",
        lastName: "Kowalski",
        relationship: "daughter",
        phone: "(978) 555-0139",
        email: "anna.kowalski@example.com",
        isPrimary: true,
        notes: "Ask for updates by phone rather than voicemail",
      },
    ],
  },
  {
    key: "falls",
    story:
      "Two falls in the last thirty days and a fall-risk assessment that is overdue, for " +
      '"who has fallen recently" and the overdue-assessments tile.',
    firstName: "Eugene",
    lastName: "Barlow",
    sex: "male",
    dateOfBirth: "1935-11-02",
    facilityCode: "MDW",
    unitCode: "A",
    roomNumber: "115",
    admittedDaysAgo: 900,
    codeStatus: "dnr_dni",
    diet: "regular",
    mobility: "walker",
    conditions: [
      { code: CODES.hypertension, onsetDaysAgo: 7300 },
      { code: OSTEOARTHRITIS_HIP, onsetDaysAgo: 3650 },
      { code: CODES.osteoporosis, onsetDaysAgo: 2000 },
      { code: ARTIFICIAL_JOINT, onsetDaysAgo: 1500 },
    ],
    allergies: [],
    medicationOrders: [
      { code: MEDICATIONS.lisinopril10, treats: CODES.hypertension, startedDaysAgo: 900 },
      { code: MEDICATIONS.alendronate, treats: CODES.osteoporosis, startedDaysAgo: 800 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 900 },
      {
        code: MEDICATIONS.tramadolAsNeeded,
        treats: OSTEOARTHRITIS_HIP,
        startedDaysAgo: 40,
        instructions: "For hip pain not relieved by acetaminophen; observe for drowsiness",
      },
    ],
    assessments: [
      { kind: "fall_risk", daysAgo: 112, hour: 9, score: 45 },
      { kind: "fall_risk", daysAgo: 202, hour: 9, score: 35 },
    ],
    incidents: [
      {
        kind: "fall",
        daysAgo: 9,
        hour: 2,
        description:
          "At approximately 2 am Mr. Barlow was found on the floor beside the bed, having tried " +
          "to walk to the bathroom without his walker. No injury on assessment, full range of " +
          "motion, vitals within baseline. Assisted back to bed. Family and physician notified. " +
          "Bed alarm placed.",
        injury: false,
      },
      {
        kind: "fall",
        daysAgo: 23,
        hour: 19,
        description:
          "At approximately 7 pm Mr. Barlow lost balance in the bathroom and was lowered to the " +
          "floor by staff. Skin tear to the left forearm, cleaned and dressed. Assisted back to " +
          "chair. Family and physician notified. Fall-risk measures reviewed.",
        injury: true,
      },
    ],
    progressNotes: [
      {
        daysAgo: 9,
        shift: "night",
        body:
          "Found on the floor beside the bed at 2 am; see incident report. No injury. Bed alarm " +
          "in place, non-skid socks on, call light within reach; reminded to call for " +
          "assistance. Slept from 3 am onward.",
      },
      {
        daysAgo: 22,
        shift: "day",
        body:
          "Skin tear on the left forearm from yesterday's fall cleaned and redressed; edges " +
          "approximated, no drainage. Walking with walker and supervision today; reports hip " +
          "pain 3 of 10, relieved by scheduled analgesic.",
      },
    ],
    familyContacts: [
      {
        firstName: "Linda",
        lastName: "Reyes",
        relationship: "daughter",
        phone: "(508) 555-0163",
        email: "linda.reyes@example.com",
        isPrimary: true,
        notes: "Lives out of state; call for any change in condition",
      },
      {
        firstName: "Paul",
        lastName: "Barlow",
        relationship: "son",
        phone: "(781) 555-0108",
        isPrimary: false,
        notes: "Visits every Sunday afternoon",
      },
    ],
  },
  {
    key: "readmitted",
    story:
      "Sent to the hospital sixteen days ago with a heart failure exacerbation and back eleven " +
      "days ago; his medication orders changed on the way out and on the way back.",
    firstName: "Frank",
    lastName: "Moreau",
    sex: "male",
    dateOfBirth: "1944-06-30",
    facilityCode: "HBR",
    unitCode: "A",
    roomNumber: "121",
    admittedDaysAgo: 540,
    codeStatus: "dnr",
    diet: "cardiac",
    mobility: "cane",
    conditions: [
      { code: CODES.heartFailure, onsetDaysAgo: 1825 },
      { code: CODES.atrialFibrillation, onsetDaysAgo: 2555 },
      { code: CODES.ckdStage3, onsetDaysAgo: 1095 },
      { code: CODES.hypertension, onsetDaysAgo: 7300 },
      { code: CODES.hyperlipidemia, onsetDaysAgo: 5000 },
    ],
    allergies: [{ code: ALLERGENS.latex, reaction: "Wheal", severity: "mild" }],
    medicationOrders: [
      {
        code: MEDICATIONS.furosemide40,
        treats: CODES.heartFailure,
        startedDaysAgo: 500,
        endedDaysAgo: 16,
      },
      {
        code: MEDICATIONS.furosemide40,
        treats: CODES.heartFailure,
        startedDaysAgo: 11,
        frequency: "twice_daily",
        instructions:
          "Increased to twice daily after hospital stay; daily weight, hold and notify physician if systolic under 100",
      },
      {
        code: MEDICATIONS.lisinopril20,
        treats: CODES.heartFailure,
        startedDaysAgo: 500,
        endedDaysAgo: 16,
      },
      {
        code: MEDICATIONS.losartan25,
        treats: CODES.hypertension,
        startedDaysAgo: 11,
        instructions: "Replaces lisinopril after hospital stay; hold if systolic under 100",
      },
      { code: MEDICATIONS.metoprololSuccinate25, startedDaysAgo: 11 },
      { code: MEDICATIONS.warfarin5, treats: CODES.atrialFibrillation, startedDaysAgo: 540 },
      { code: MEDICATIONS.simvastatin10, treats: CODES.hyperlipidemia, startedDaysAgo: 540 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 540 },
    ],
    assessments: [
      {
        kind: "physician_visit",
        daysAgo: 11,
        hour: 14,
        findings:
          "Readmission visit after a five-day stay at Gloucester General Hospital for heart " +
          "failure exacerbation. Lungs with faint bibasilar crackles, trace ankle edema, weight " +
          "down six pounds from the day of transfer. Medications reconciled against the " +
          "discharge summary: furosemide increased to twice daily, lisinopril replaced by " +
          "losartan at a lower dose, metoprolol added. Daily weights, cardiac diet with fluid " +
          "restriction, follow up in two weeks.",
      },
      { kind: "physician_visit", daysAgo: 45, hour: 10 },
      {
        kind: "nursing_assessment",
        daysAgo: 11,
        hour: 13,
        findings:
          "Readmission nursing assessment. Alert and oriented, breathing comfortably on room " +
          "air, oxygen saturation 95 percent. Ambulates with a cane, steady, tires after fifty " +
          "feet. Skin intact; trace edema both ankles. Appetite fair on cardiac diet; fluid " +
          "restriction of 1.5 liters posted at bedside. Weight 168 pounds on return.",
      },
      { kind: "fall_risk", daysAgo: 11, hour: 13, score: 40 },
    ],
    carePlan: {
      code: CARE_PLANS.heartFailure,
      treats: CODES.heartFailure,
      startedDaysAgo: 530,
      goals: [
        {
          goal: "Weight gain under three pounds in any week",
          intervention: "Daily morning weight; notify physician of a three-pound gain in a week",
          targetInDays: 30,
          status: "in_progress",
        },
        {
          goal: "No shortness of breath at rest",
          intervention: "Head of bed elevated; lung sounds each shift; diuretic as ordered",
          targetInDays: 30,
          status: "in_progress",
        },
        {
          goal: "Fluid intake within the ordered restriction",
          intervention: "Fluid restriction posted at bedside; intake recorded each shift",
          targetInDays: 30,
          status: "in_progress",
        },
      ],
    },
    appointments: [
      {
        kind: "hospital",
        inDays: -16,
        hour: 14,
        minute: 30,
        location: "Gloucester General Hospital",
        purpose:
          "Emergency transfer: shortness of breath and weight gain, suspected heart failure exacerbation",
        status: "completed",
      },
      {
        kind: "specialist",
        inDays: 6,
        hour: 10,
        location: "Gloucester Cardiology Associates",
        purpose: "Cardiology follow-up after hospital stay",
        status: "scheduled",
      },
    ],
    progressNotes: [
      {
        daysAgo: 16,
        shift: "evening",
        body:
          "Mr. Moreau increasingly short of breath through the afternoon, oxygen saturation 88 " +
          "percent on room air, four-pound weight gain over three days. Physician notified; " +
          "transferred to Gloucester General Hospital by ambulance at 2:30 pm. Wife notified.",
      },
      {
        daysAgo: 11,
        shift: "day",
        body:
          "Returned from Gloucester General Hospital at 11:15 am after a five-day stay for " +
          "heart failure exacerbation. Alert, breathing comfortably on room air. Discharge " +
          "summary reviewed with physician; medication orders updated, daily weights started.",
      },
      {
        daysAgo: 5,
        shift: "day",
        body:
          "Weight stable since return; no shortness of breath at rest. Tolerating cardiac diet " +
          "and fluid restriction. Walked to the dining room with his cane, rested afterward.",
      },
    ],
    familyContacts: [
      {
        firstName: "Claire",
        lastName: "Moreau",
        relationship: "spouse",
        phone: "(978) 555-0184",
        isPrimary: true,
        notes: "Visits daily after lunch; holds health care proxy",
      },
      {
        firstName: "Denise",
        lastName: "Fortin",
        relationship: "daughter",
        phone: "(617) 555-0121",
        email: "denise.fortin@example.com",
        isPrimary: false,
        notes: "Attends care conferences",
      },
    ],
  },
  {
    key: "dementia",
    story:
      "Alzheimer's disease, a daughter who calls the unit most evenings, and progress notes " +
      "that record what she asked about.",
    firstName: "Rose",
    lastName: "Delgado",
    sex: "female",
    dateOfBirth: "1937-04-09",
    facilityCode: "MDW",
    unitCode: "B",
    roomNumber: "207",
    admittedDaysAgo: 800,
    codeStatus: "dnr",
    diet: "mechanical_soft",
    mobility: "one_person_assist",
    conditions: [
      { code: CODES.dementia, onsetDaysAgo: 2190 },
      { code: CODES.hypertension, onsetDaysAgo: 6000 },
      { code: CODES.osteoporosis, onsetDaysAgo: 2500 },
      { code: REFLUX, onsetDaysAgo: 3000 },
    ],
    allergies: [{ code: ALLERGENS.treeNut, reaction: "Wheal", severity: "moderate" }],
    medicationOrders: [
      { code: MEDICATIONS.donepezilMemantine, treats: CODES.dementia, startedDaysAgo: 700 },
      { code: MEDICATIONS.amlodipine, treats: CODES.hypertension, startedDaysAgo: 800 },
      { code: MEDICATIONS.alendronate, treats: CODES.osteoporosis, startedDaysAgo: 780 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 800 },
    ],
    assessments: [
      {
        kind: "physician_visit",
        daysAgo: 8,
        hour: 11,
        findings:
          "Routine visit. Mrs. Delgado seen in the day room, calm, humming along with the music " +
          "group. Cognition at baseline: oriented to self only, follows one-step commands. " +
          "Eating 50 to 75 percent of meals on mechanical soft diet, weight stable. Her " +
          "daughter has asked for a call after each visit; nursing to update her this evening. " +
          "Continue current plan of care.",
      },
      { kind: "physician_visit", daysAgo: 52, hour: 11 },
    ],
    carePlan: {
      code: CARE_PLANS.dementia,
      treats: CODES.dementia,
      startedDaysAgo: 790,
      goals: [
        {
          goal: "Fewer than two episodes of agitation per week",
          intervention:
            "Consistent caregivers, structured daily routine, music therapy in the afternoon",
          targetInDays: 30,
          status: "in_progress",
        },
        {
          goal: "Remains safe on the unit without elopement",
          intervention: "Door alarm, photo at nursing station, wander check every hour",
          targetInDays: -60,
          status: "met",
        },
        {
          goal: "Family updated on cognition and mood monthly",
          intervention: "Nurse calls the primary contact after each physician visit",
          targetInDays: 20,
          status: "in_progress",
        },
      ],
    },
    incidents: [
      {
        kind: "behavioral",
        daysAgo: 12,
        hour: 17,
        description:
          "At 5 pm Mrs. Delgado became distressed at the dining room door, asking to go home to " +
          "her mother. Redirected to her room with music; calm within twenty minutes and ate " +
          "dinner there. Daughter called and was reassured.",
        injury: false,
      },
    ],
    progressNotes: [
      {
        daysAgo: 1,
        shift: "evening",
        body:
          "Daughter Teresa called at 7:10 pm asking about her mother's appetite and whether she " +
          "had been out of her room today. Updated her on 75 percent of dinner and the " +
          "afternoon music group; she will visit Sunday. Mrs. Delgado settled by 9 pm.",
      },
      {
        daysAgo: 3,
        shift: "evening",
        body:
          "Teresa called at 6:50 pm; asked about the bruise on her mother's hand (from Monday's " +
          "blood draw, resolving). Reassured. Some sundowning after dinner, redirected with " +
          "folding towels.",
      },
      {
        daysAgo: 8,
        shift: "evening",
        body:
          "Called daughter Teresa after today's physician visit as requested; reviewed weight, " +
          "appetite, and cognition at baseline. She asked for a care conference next month; " +
          "social work to schedule.",
      },
      {
        daysAgo: 15,
        shift: "evening",
        body:
          "Daughter called the unit at 7 pm; her mother had asked for her repeatedly this " +
          "afternoon. Put the two of them on the phone for a few minutes; Mrs. Delgado " +
          "brightened and went to dinner without difficulty.",
      },
    ],
    familyContacts: [
      {
        firstName: "Teresa",
        lastName: "Ruiz",
        relationship: "daughter",
        phone: "(617) 555-0128",
        email: "teresa.ruiz@example.com",
        isPrimary: true,
        notes: "Calls the unit most evenings around 7 pm; holds health care proxy",
      },
      {
        firstName: "Michael",
        lastName: "Delgado",
        relationship: "son",
        phone: "(617) 555-0190",
        isPrimary: false,
        notes: "Visits every Sunday afternoon",
      },
    ],
  },
  {
    key: "wound-series",
    story:
      "A stage II pressure injury with a weekly wound-check series whose measurements shrink " +
      "from one check to the next.",
    firstName: "Samuel",
    lastName: "Whitcomb",
    sex: "male",
    dateOfBirth: "1939-01-25",
    facilityCode: "ORC",
    unitCode: "A",
    roomNumber: "118",
    admittedDaysAgo: 300,
    codeStatus: "dnr_dni",
    diet: "regular",
    mobility: "two_person_assist",
    conditions: [
      { code: CODES.pressureInjury, onsetDaysAgo: 36 },
      { code: CODES.diabetes, onsetDaysAgo: 4000 },
      { code: CODES.hypertension, onsetDaysAgo: 6000 },
      { code: NEUROPATHY, onsetDaysAgo: 1200 },
    ],
    allergies: [{ code: ALLERGENS.aspirin, reaction: "Abdominal pain", severity: "moderate" }],
    medicationOrders: [
      { code: MEDICATIONS.metforminEr, treats: CODES.diabetes, startedDaysAgo: 300 },
      { code: MEDICATIONS.lisinopril10, treats: CODES.hypertension, startedDaysAgo: 300 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 300 },
    ],
    assessments: [
      {
        kind: "wound_check",
        daysAgo: 1,
        hour: 10,
        findings:
          "Stage II pressure injury, sacrum, 2.1 by 1.4 cm, wound bed clean and dry, " +
          "epithelializing at edges. Cleansed with saline, foam dressing applied. Repositioning " +
          "schedule in place. Slightly smaller than last measurement.",
      },
      {
        kind: "wound_check",
        daysAgo: 8,
        hour: 10,
        findings:
          "Stage II pressure injury, sacrum, 2.5 by 1.7 cm, wound bed pink, scant serous " +
          "drainage. Cleansed with saline, foam dressing applied. Repositioning schedule in " +
          "place. Improving since last check.",
      },
      {
        kind: "wound_check",
        daysAgo: 15,
        hour: 10,
        findings:
          "Stage II pressure injury, sacrum, 2.9 by 2.0 cm, wound bed pink with granulation " +
          "tissue, no odor. Cleansed with saline, foam dressing applied. Repositioning schedule " +
          "in place. Improving since last check.",
      },
      {
        kind: "wound_check",
        daysAgo: 22,
        hour: 10,
        findings:
          "Stage II pressure injury, sacrum, 3.3 by 2.3 cm, wound bed with small amount of " +
          "slough, edges attached. Cleansed with saline, foam dressing applied. Repositioning " +
          "schedule in place. Slightly smaller than last measurement.",
      },
      {
        kind: "wound_check",
        daysAgo: 29,
        hour: 10,
        findings:
          "Stage II pressure injury, sacrum, 3.7 by 2.6 cm, wound bed pink, scant serous " +
          "drainage. Cleansed with saline, foam dressing applied. Repositioning schedule started, " +
          "pressure-redistributing mattress in place. Baseline measurement.",
      },
    ],
    carePlan: {
      code: CARE_PLANS.woundCare,
      treats: CODES.pressureInjury,
      startedDaysAgo: 35,
      goals: [
        {
          goal: "Pressure injury reduced in size by 30 percent in four weeks",
          intervention: "Foam dressing changed every three days; weekly wound measurement",
          targetInDays: -7,
          status: "met",
        },
        {
          goal: "No new areas of skin breakdown",
          intervention:
            "Reposition every two hours; pressure-redistributing mattress; heels floated",
          targetInDays: 21,
          status: "in_progress",
        },
        {
          goal: "Protein intake meets dietitian target",
          intervention: "Protein supplement twice daily; weekly weight",
          targetInDays: 21,
          status: "in_progress",
        },
      ],
    },
    progressNotes: [
      {
        daysAgo: 1,
        shift: "day",
        body:
          "Weekly wound check completed; sacral pressure injury measures 2.1 by 1.4 cm, down " +
          "from 3.7 by 2.6 at baseline. Foam dressing changed, heels floated, repositioned every " +
          "two hours. Protein supplement taken with breakfast and dinner.",
      },
    ],
    familyContacts: [
      {
        firstName: "Grace",
        lastName: "Whitcomb",
        relationship: "spouse",
        phone: "(413) 555-0147",
        isPrimary: true,
        notes: "Visits every afternoon; holds health care proxy",
      },
      {
        firstName: "Peter",
        lastName: "Whitcomb",
        relationship: "son",
        phone: "(413) 555-0172",
        email: "peter.whitcomb@example.com",
        isPrimary: false,
      },
    ],
  },
  {
    key: "recently-former",
    story:
      "Discharged home six days ago after ten weeks of rehabilitation for a hip fracture: a " +
      "former resident whose record is intact and whose room is free.",
    firstName: "Irene",
    lastName: "Castellano",
    sex: "female",
    dateOfBirth: "1946-10-12",
    facilityCode: "CMN",
    unitCode: "D",
    roomNumber: null,
    admittedDaysAgo: 76,
    stay: { endedDaysAgo: 6, reason: "discharged" },
    codeStatus: "full_code",
    diet: "regular",
    mobility: "walker",
    conditions: [
      { code: CODES.hipFracture, onsetDaysAgo: 82, resolvedDaysAgo: 10 },
      { code: CODES.hypertension, onsetDaysAgo: 5000 },
      { code: CODES.osteoporosis, onsetDaysAgo: 1500 },
    ],
    allergies: [],
    medicationOrders: [
      {
        code: MEDICATIONS.lisinopril10,
        treats: CODES.hypertension,
        startedDaysAgo: 76,
        endedDaysAgo: 6,
      },
      {
        code: MEDICATIONS.alendronate,
        treats: CODES.osteoporosis,
        startedDaysAgo: 70,
        endedDaysAgo: 6,
      },
      {
        code: MEDICATIONS.tramadolAsNeeded,
        treats: CODES.hipFracture,
        startedDaysAgo: 76,
        endedDaysAgo: 30,
      },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 76, endedDaysAgo: 6 },
    ],
    assessments: [
      {
        kind: "physician_visit",
        daysAgo: 8,
        hour: 10,
        findings:
          "Discharge visit. Mrs. Castellano walking the length of the hallway with a walker " +
          "without pain; hip incision well healed, full weight bearing. Cleared for discharge " +
          "home with outpatient physical therapy; medication list reconciled for home.",
      },
      { kind: "physician_visit", daysAgo: 60, hour: 10 },
      {
        kind: "nursing_assessment",
        daysAgo: 7,
        hour: 9,
        findings:
          "Discharge nursing assessment. Independent with feeding and dressing, supervision for " +
          "bathing; ambulates with a walker. Skin intact, incision healed. Appetite good on " +
          "regular diet. Cognition: alert and oriented, participates in care decisions. Home " +
          "safety reviewed with daughter.",
      },
      { kind: "fall_risk", daysAgo: 7, hour: 9, score: 30 },
    ],
    carePlan: {
      code: CARE_PLANS.fractureCare,
      treats: CODES.hipFracture,
      startedDaysAgo: 76,
      goals: [
        {
          goal: "Weight-bearing as tolerated without pain above 3 of 10",
          intervention: "Scheduled analgesic before therapy; physical therapy five times weekly",
          targetInDays: -14,
          status: "met",
        },
        {
          goal: "Transfers with one-person assist within six weeks",
          intervention: "Gait training with walker; hip precautions reviewed each shift",
          targetInDays: -34,
          status: "met",
        },
        {
          goal: "No falls during recovery",
          intervention: "Bed alarm, non-skid socks, call light within reach, hourly rounding",
          targetInDays: -6,
          status: "met",
        },
      ],
    },
    appointments: [
      {
        kind: "specialist",
        inDays: -20,
        hour: 9,
        minute: 30,
        location: "Worcester Orthopedic Group",
        purpose: "Orthopedic follow-up, hip X-ray",
        status: "completed",
      },
    ],
    progressNotes: [
      {
        daysAgo: 7,
        shift: "day",
        body:
          "Discharge planning: daughter confirmed she will stay with her mother for the first " +
          "two weeks; home health and outpatient therapy arranged. Walker and shower chair " +
          "delivered to the home.",
      },
      {
        daysAgo: 6,
        shift: "day",
        body:
          "Discharged home at 10:30 am with daughter. Medication list and therapy schedule " +
          "reviewed; all questions answered. Belongings inventoried and sent with her.",
      },
    ],
    familyContacts: [
      {
        firstName: "Maria",
        lastName: "Castellano",
        relationship: "daughter",
        phone: "(508) 555-0195",
        email: "maria.castellano@example.com",
        isPrimary: true,
        notes: "Staying with her mother at home for two weeks after discharge",
      },
    ],
  },
  {
    key: "weight-loss",
    story:
      "Weekly weights down eleven pounds in five weeks, a dietitian consult, and a chart that " +
      "reads like something is going on.",
    firstName: "Clara",
    lastName: "Beaumont",
    sex: "female",
    dateOfBirth: "1933-07-19",
    facilityCode: "BAY",
    unitCode: "B",
    roomNumber: "226",
    admittedDaysAgo: 1100,
    codeStatus: "dnr",
    diet: "regular",
    mobility: "wheelchair",
    conditions: [
      { code: CODES.depression, onsetDaysAgo: 2000 },
      { code: CODES.hypothyroidism, onsetDaysAgo: 5000 },
      { code: OSTEOARTHRITIS_KNEE, onsetDaysAgo: 4000 },
      { code: CODES.hypertension, onsetDaysAgo: 7000 },
    ],
    allergies: [{ code: ALLERGENS.fish, reaction: "Dyspnea", severity: "moderate" }],
    medicationOrders: [
      { code: MEDICATIONS.levothyroxine, startedDaysAgo: 1100 },
      { code: MEDICATIONS.sertraline, startedDaysAgo: 1000 },
      { code: MEDICATIONS.amlodipine, treats: CODES.hypertension, startedDaysAgo: 1100 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 1100 },
    ],
    vitals: { weight: { currentLb: 127.4, changePerWeekLb: -2.2 } },
    assessments: [
      {
        kind: "nursing_assessment",
        daysAgo: 5,
        hour: 9,
        findings:
          "Quarterly nursing assessment. Independent with feeding, assist of one for dressing; " +
          "mobilizes by wheelchair. Skin intact. Weight 129 pounds, down eleven pounds over five " +
          "weeks; intake 25 to 50 percent of meals on regular diet, dietitian consult requested. " +
          "Cognition: alert and oriented. Mood flat, sleeping poorly; declines afternoon " +
          "activities.",
      },
      {
        kind: "physician_visit",
        daysAgo: 3,
        hour: 10,
        findings:
          "Seen for unintentional weight loss of eleven pounds over five weeks. Denies pain, " +
          "nausea, or change in bowel habit; mood low, sleeping poorly. Exam unremarkable, no " +
          "masses, no edema. Labs ordered for the next draw, dietitian consult, nutritional " +
          "supplement twice daily, mood to be reviewed with social work. Follow up in two weeks.",
      },
      { kind: "physician_visit", daysAgo: 48, hour: 10 },
    ],
    carePlan: {
      code: CARE_PLANS.depression,
      treats: CODES.depression,
      startedDaysAgo: 400,
      goals: [
        {
          goal: "Attends at least three group activities per week",
          intervention:
            "Activities staff invite personally; preferred activities listed in care plan",
          targetInDays: 30,
          status: "in_progress",
        },
        {
          goal: "PHQ-9 score improved at next quarterly screen",
          intervention: "Antidepressant as ordered; social work visit every two weeks",
          targetInDays: 40,
          status: "in_progress",
        },
      ],
    },
    progressNotes: [
      {
        daysAgo: 6,
        shift: "day",
        body:
          "Mrs. Beaumont ate 25 percent of breakfast and 50 percent of lunch; declined the " +
          "afternoon snack. Weekly weight 129.8 pounds, down two pounds again. Dietitian " +
          "notified; nursing assessment moved up.",
      },
      {
        daysAgo: 2,
        shift: "day",
        body:
          "Dietitian visited: nutritional supplement twice daily started, favorite foods list " +
          "posted at the bedside. Ate 50 percent of lunch with encouragement. Social work to " +
          "see her tomorrow.",
      },
    ],
    familyContacts: [
      {
        firstName: "Nora",
        lastName: "Beaumont",
        relationship: "daughter",
        phone: "(508) 555-0133",
        email: "nora.beaumont@example.com",
        isPrimary: true,
        notes: "Calls Tuesday and Friday evenings; holds health care proxy",
      },
    ],
  },
  {
    key: "unmet-goal",
    story:
      "A hypertension care plan whose blood-pressure goal came due unmet: his morning readings " +
      "are still in the 150s.",
    firstName: "Vernon",
    lastName: "Pryor",
    sex: "male",
    dateOfBirth: "1948-12-05",
    facilityCode: "PNS",
    unitCode: "C",
    roomNumber: "309",
    admittedDaysAgo: 150,
    codeStatus: "full_code",
    diet: "cardiac",
    mobility: "independent",
    conditions: [
      { code: CODES.hypertension, onsetDaysAgo: 4000 },
      { code: CODES.hyperlipidemia, onsetDaysAgo: 3000 },
      { code: CODES.obesity, onsetDaysAgo: 5000 },
      { code: SLEEP_APNEA, onsetDaysAgo: 1800 },
    ],
    allergies: [{ code: ALLERGENS.lisinopril, reaction: "Cough", severity: "moderate" }],
    medicationOrders: [
      { code: MEDICATIONS.losartan25, treats: CODES.hypertension, startedDaysAgo: 150 },
      {
        code: MEDICATIONS.hydrochlorothiazide,
        treats: CODES.hypertension,
        startedDaysAgo: 60,
        instructions: "Added when the blood pressure goal was not met at 90 days",
      },
      { code: MEDICATIONS.simvastatin10, treats: CODES.hyperlipidemia, startedDaysAgo: 150 },
      { code: MEDICATIONS.acetaminophenAsNeeded, startedDaysAgo: 150 },
    ],
    vitals: { systolic: 154, diastolic: 92 },
    assessments: [
      {
        kind: "physician_visit",
        daysAgo: 14,
        hour: 10,
        findings:
          "Care plan review. Blood pressure goal of 140/90 not met at 90 days: morning readings " +
          "average 152 over 90 on losartan and hydrochlorothiazide. Hydrochlorothiazide " +
          "continued, sodium intake reviewed with the dietitian, recheck in four weeks; will " +
          "add a third agent if still above goal. Lisinopril not an option (cough).",
      },
      { kind: "physician_visit", daysAgo: 74, hour: 10 },
    ],
    carePlan: {
      code: CARE_PLANS.hypertension,
      treats: CODES.hypertension,
      startedDaysAgo: 140,
      goals: [
        {
          goal: "Blood pressure below 140/90 on routine checks",
          intervention:
            "Vitals each morning; hold antihypertensive and notify physician if systolic under 100",
          targetInDays: -14,
          status: "not_met",
        },
        {
          goal: "Sodium intake within the cardiac diet",
          intervention: "Cardiac diet tray; dietitian review monthly",
          targetInDays: -14,
          status: "met",
        },
        {
          goal: "No dizziness on standing",
          intervention: "Rise slowly with assistance; orthostatic blood pressure weekly",
          targetInDays: 30,
          status: "in_progress",
        },
      ],
    },
    progressNotes: [
      {
        daysAgo: 1,
        shift: "day",
        body:
          "Morning blood pressure 156 over 91, recheck 150 over 88 after resting. Physician " +
          "aware; on the list for the four-week recheck. Walked the hallway twice with no " +
          "dizziness. Ate 100 percent of lunch on cardiac diet.",
      },
    ],
    familyContacts: [
      {
        firstName: "Gloria",
        lastName: "Pryor",
        relationship: "spouse",
        phone: "(413) 555-0158",
        isPrimary: true,
        notes: "Visits every Sunday afternoon; brings laundry home on Fridays",
      },
    ],
  },
];

export const HERO_BY_KEY: ReadonlyMap<HeroKey, HeroDefinition> = new Map(
  HERO_RESIDENTS.map((hero) => [hero.key, hero]),
);
