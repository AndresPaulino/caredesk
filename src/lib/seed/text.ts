/**
 * The words in the seed: assessment findings, progress notes, incident descriptions, care plan
 * goals, appointment details. Templates are chosen and filled deterministically from a
 * resident's random generator, and read like a chart rather than lorem ipsum.
 */
import type { Enums } from "../supabase/database.types";

import type { Random } from "./random";

export type ResidentContext = {
  firstName: string;
  lastName: string;
  sex: "female" | "male";
  /** "Mr." or "Mrs."; charts use the surname. */
  title: string;
  he: string;
  him: string;
  his: string;
  ageYears: number;
  mobility: Enums<"mobility">;
  diet: Enums<"diet">;
  hasDementia: boolean;
  hasDiabetes: boolean;
  hasHeartFailure: boolean;
  hasCopd: boolean;
  hasHypertension: boolean;
  hasPressureInjury: boolean;
};

export function pronounsFor(sex: "female" | "male") {
  return sex === "female"
    ? { title: "Mrs.", he: "she", him: "her", his: "her" }
    : { title: "Mr.", he: "he", him: "him", his: "his" };
}

const MOBILITY_PHRASES: Record<Enums<"mobility">, string> = {
  independent: "ambulates independently",
  cane: "ambulates with a cane",
  walker: "ambulates with a walker",
  wheelchair: "mobilizes by wheelchair",
  one_person_assist: "transfers with one-person assist",
  two_person_assist: "transfers with two-person assist",
  bedbound: "is bedbound and repositioned every two hours",
};

const DIET_PHRASES: Record<Enums<"diet">, string> = {
  regular: "regular diet",
  cardiac: "cardiac diet",
  diabetic: "diabetic diet",
  renal: "renal diet",
  mechanical_soft: "mechanical soft diet",
  pureed: "pureed diet",
  thickened_liquids: "thickened liquids",
};

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// ---------------------------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------------------------

export type FindingsExtra = { score?: number; panelName?: string };

export function assessmentFindings(
  random: Random,
  kind: Enums<"assessment_kind">,
  ctx: ResidentContext,
  extra: FindingsExtra = {},
): string {
  const name = `${ctx.title} ${ctx.lastName}`;
  switch (kind) {
    case "physician_visit": {
      const opening = random.pick([
        `Routine visit. ${name} seen in ${ctx.his} room, resting comfortably.`,
        `Scheduled visit. ${name} reviewed with charge nurse present.`,
        `${name} seen for routine follow-up; no acute complaints.`,
        `Monthly visit. Reviewed vitals, medication administration record, and recent notes.`,
      ]);
      const exam = random.pick([
        "Lungs clear bilaterally, heart regular rate and rhythm, abdomen soft.",
        "Chest clear, no peripheral edema, skin intact on inspection.",
        "Alert, oriented to person, heart sounds normal, no new findings on exam.",
        "Mild bilateral ankle edema, otherwise unremarkable exam.",
      ]);
      const plan = [
        ctx.hasHypertension
          ? random.pick([
              "Blood pressure at goal on current regimen.",
              "Blood pressure trending high; continue monitoring and recheck in two weeks.",
            ])
          : null,
        ctx.hasDiabetes
          ? random.pick([
              "Fingerstick glucose log reviewed; no changes to diabetic regimen.",
              "A1c reviewed; continue current diabetic regimen and diet.",
            ])
          : null,
        ctx.hasHeartFailure
          ? "Weight stable, no orthopnea; continue diuretic at current dose."
          : null,
        ctx.hasDementia
          ? random.pick([
              "Cognition at baseline; family updated by nursing.",
              "Some evening confusion reported; non-pharmacologic measures reinforced.",
            ])
          : null,
        random.pick([
          "Medication list reconciled, no changes.",
          "Continue current plan of care.",
          "Labs ordered for next draw.",
          "Will follow up next month or sooner as needed.",
        ]),
      ].filter(Boolean);
      return `${opening} ${exam} ${plan.join(" ")}`;
    }
    case "nursing_assessment": {
      const adls = random.pick([
        `Requires setup for meals and supervision for hygiene; ${MOBILITY_PHRASES[ctx.mobility]}.`,
        `Independent with feeding, assist of one for dressing; ${MOBILITY_PHRASES[ctx.mobility]}.`,
        `Needs extensive assist with bathing and toileting; ${MOBILITY_PHRASES[ctx.mobility]}.`,
      ]);
      const skin = ctx.hasPressureInjury
        ? "Skin: stage II pressure injury present, see wound check."
        : random.pick([
            "Skin intact, no areas of redness.",
            "Skin dry and intact; barrier cream applied to heels.",
          ]);
      const appetite = random.pick([
        `Appetite fair, eating 50 to 75 percent of meals on ${DIET_PHRASES[ctx.diet]}.`,
        `Appetite good, tolerating ${DIET_PHRASES[ctx.diet]}.`,
        `Intake variable; dietitian consult requested.`,
      ]);
      const cognition = ctx.hasDementia
        ? random.pick([
            "Cognition: oriented to self only, follows simple one-step commands, redirectable.",
            "Cognition: pleasantly confused, wanders in the evening, responds to familiar staff.",
          ])
        : random.pick([
            "Cognition: alert and oriented, participates in care decisions.",
            "Cognition: oriented to person and place, occasional word-finding difficulty.",
          ]);
      const mood = random.pick([
        "Mood bright, enjoys group activities.",
        "Mood flat at times; encouraged to attend afternoon activities.",
        "Sleeps well, no pain reported.",
        "Reports intermittent knee pain, 3 of 10, relieved by scheduled analgesic.",
      ]);
      return `Quarterly nursing assessment. ${adls} ${skin} ${appetite} ${cognition} ${mood}`;
    }
    case "wound_check": {
      const site = random.pick(["sacrum", "left heel", "right heel", "coccyx"]);
      const length = (random.int(12, 40) / 10).toFixed(1);
      const width = (random.int(8, 30) / 10).toFixed(1);
      const bed = random.pick([
        "wound bed pink with granulation tissue, no odor",
        "wound bed pink, scant serous drainage",
        "wound bed with small amount of slough, edges attached",
        "wound bed clean and dry, epithelializing at edges",
      ]);
      const trend = random.pick([
        "Improving since last check.",
        "Unchanged since last check.",
        "Slightly smaller than last measurement.",
      ]);
      return `Stage II pressure injury, ${site}, ${length} by ${width} cm, ${bed}. Cleansed with saline, foam dressing applied. Repositioning schedule in place. ${trend}`;
    }
    case "podiatry": {
      const base = random.pick([
        "Toenails thickened and trimmed bilaterally, calluses debrided from plantar surfaces.",
        "Nails trimmed and filed, mild onychomycosis noted, no treatment indicated.",
        "Nails trimmed; corn on right fifth toe pared, felt padding applied.",
      ]);
      const feet = ctx.hasDiabetes
        ? random.pick([
            "Diabetic foot exam: pedal pulses palpable, monofilament sensation reduced at the forefoot, no ulceration.",
            "Diabetic foot exam: skin intact, pulses present, protective sensation diminished; footwear reviewed.",
          ])
        : "Skin intact, pulses palpable, no lesions.";
      return `${base} ${feet} Return in 90 days.`;
    }
    case "dental":
      return random.pick([
        "Oral exam: upper and lower dentures fit well, mild irritation at lower ridge, tissue otherwise healthy. Dentures cleaned and relined.",
        "Oral exam: partial upper denture, natural lower dentition with moderate plaque. Cleaning completed, oral care instructions given to staff.",
        "Oral exam: edentulous, gums healthy, no lesions. Dentures adjusted for comfort.",
        "Oral exam: broken cusp on lower left molar, no pain. Smoothed; monitor and refer if symptomatic.",
      ]);
    case "vision":
      return random.pick([
        "Visual acuity 20/40 right, 20/50 left with current glasses. Early cataracts both eyes, no change in prescription.",
        "Visual acuity 20/30 both eyes with correction. Glasses updated. No retinal findings.",
        "Visual acuity 20/70 right, 20/60 left. Dense cataract right eye; referred to ophthalmology to discuss surgery.",
        "Visual acuity stable. Mild dry eye; artificial tears recommended twice daily.",
      ]);
    case "fall_risk": {
      const score = extra.score ?? 0;
      const level = score < 25 ? "low" : score < 45 ? "moderate" : "high";
      const measures =
        level === "high"
          ? "Bed and chair alarms in use, non-skid socks, call light within reach, hourly rounding."
          : level === "moderate"
            ? "Non-skid socks, call light within reach, assist with transfers."
            : "Standard precautions; call light within reach.";
      return `Morse Fall Scale total ${score}, ${level} risk. ${cap(MOBILITY_PHRASES[ctx.mobility])}. ${measures}`;
    }
    case "lab_draw":
      return `Venipuncture, ${random.pick(["left", "right"])} antecubital, single attempt. ${extra.panelName ?? "Panel"} sent to lab.`;
  }
}

// ---------------------------------------------------------------------------------------------
// Progress notes
// ---------------------------------------------------------------------------------------------

export function progressNote(
  random: Random,
  ctx: ResidentContext,
  shift: "night" | "day" | "evening",
): string {
  const name = `${ctx.title} ${ctx.lastName}`;
  const He = cap(ctx.he);
  const sentences: string[] = [];

  if (shift === "night") {
    sentences.push(
      random.pick([
        `${name} slept through the night with brief awakening at ${random.int(1, 4)} am; repositioned and settled.`,
        `${name} up to the bathroom twice overnight, assisted back to bed without incident.`,
        `Restless first half of the night, slept from 1 am onward.`,
        `${name} slept well, no complaints of pain overnight.`,
      ]),
    );
    if (ctx.hasDementia && random.chance(0.4)) {
      sentences.push(
        random.pick([
          `Found in the hallway at ${random.int(2, 4)} am looking for ${ctx.his} spouse; reoriented and walked back to bed.`,
          "Called out several times overnight; reassured, warm drink offered, settled by 3 am.",
        ]),
      );
    }
  } else if (shift === "day") {
    sentences.push(
      random.pick([
        `${name} ate ${random.pick(["25", "50", "75", "100"])} percent of breakfast and ${random.pick(["50", "75", "100"])} percent of lunch on ${DIET_PHRASES[ctx.diet]}.`,
        `Morning care completed; ${ctx.he} ${MOBILITY_PHRASES[ctx.mobility]}.`,
        `${He} attended the morning exercise group and ${random.pick(["participated actively", `watched from ${ctx.his} chair`, "left early to rest"])}.`,
        `${name} spent the morning in the day room; family visited at lunch.`,
      ]),
    );
    if (ctx.hasHeartFailure && random.chance(0.5)) {
      sentences.push(
        `Daily weight ${random.pick(["stable", "up one pound from yesterday", "down half a pound"])}; no shortness of breath at rest.`,
      );
    }
    if (ctx.hasDiabetes && random.chance(0.5)) {
      sentences.push(`Fingerstick glucose ${random.int(98, 210)} before lunch.`);
    }
    if (ctx.hasCopd && random.chance(0.4)) {
      sentences.push(
        `Mild exertional dyspnea after walking to the dining room, recovered with rest.`,
      );
    }
  } else {
    sentences.push(
      random.pick([
        `${name} ate ${random.pick(["50", "75", "100"])} percent of dinner; evening medications given as scheduled.`,
        `Evening care completed, ${ctx.he} is in bed watching television, call light within reach.`,
        `${He} refused the evening shower, accepted a bed bath instead.`,
        `Visited with ${random.pick(["daughter", "son", "granddaughter", "a friend from church"])} this evening; mood bright afterward.`,
      ]),
    );
    if (ctx.hasDementia && random.chance(0.5)) {
      sentences.push(
        random.pick([
          "Some sundowning after dinner, redirected with music and a walk in the hallway.",
          "Asked repeatedly to go home; reassured and engaged in folding towels, settled.",
        ]),
      );
    }
  }

  sentences.push(
    random.pick([
      "No complaints of pain.",
      `Reports ${random.pick(["hip", "knee", "back", "shoulder"])} pain ${random.int(2, 5)} of 10, relieved after scheduled analgesic.`,
      "Skin checked during care, intact.",
      "Will continue to monitor.",
      "No change in condition.",
      "Encouraged fluids; drinking well.",
    ]),
  );
  return sentences.join(" ");
}

// ---------------------------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------------------------

export type IncidentExtra = { hour: number; medication?: string };

export function incidentDescription(
  random: Random,
  kind: Enums<"incident_kind">,
  ctx: ResidentContext,
  extra: IncidentExtra,
): { description: string; injury: boolean } {
  const name = `${ctx.title} ${ctx.lastName}`;
  const clock = `${((extra.hour + 11) % 12) + 1} ${extra.hour < 12 ? "am" : "pm"}`;
  switch (kind) {
    case "fall": {
      const injury = random.chance(0.3);
      const where = random.pick([
        "found on the floor beside the bed",
        "slid from the wheelchair while reaching for the call light",
        "lost balance in the bathroom and lowered to the floor by staff",
        "found sitting on the floor of the day room",
        "fell while walking to the dining room without the walker",
      ]);
      const outcome = injury
        ? random.pick([
            "Skin tear to the left forearm, cleaned and dressed.",
            "Bruising to the right hip, no deformity, range of motion intact; physician notified.",
            "Small laceration above the right eyebrow, steri-strips applied; neuro checks started.",
          ])
        : "No injury on assessment, full range of motion, vitals within baseline.";
      return {
        description: `At approximately ${clock} ${name} was ${where}. ${outcome} Assisted back to ${random.pick(["bed", "chair"])}. Family and physician notified. Fall-risk measures reviewed.`,
        injury,
      };
    }
    case "medication_error": {
      const medication = extra.medication ?? "scheduled medication";
      return {
        description: random.pick([
          `${clock} dose of ${medication} was given approximately two hours late during a busy medication pass. Resident monitored, no adverse effect. Physician and pharmacy notified.`,
          `${medication} was omitted from the ${clock} pass and discovered at shift change. Physician notified; dose given as directed. No adverse effect noted.`,
          `Duplicate dose of ${medication} given at ${clock} when the earlier administration had not been charted. Vitals monitored every hour for four hours, stable. Physician notified.`,
        ]),
        injury: false,
      };
    }
    case "behavioral":
      return {
        description: random.pick([
          `At ${clock} ${name} became agitated during care, striking out at staff. Approach paused, ${ctx.he} was given space and reapproached after fifteen minutes; care completed without further incident.`,
          `${name} was verbally aggressive toward a tablemate at dinner and left the dining room. Redirected to ${ctx.his} room, meal served there. Calm within the hour.`,
          `Found attempting to leave through the unit exit at ${clock}, saying ${ctx.he} needed to get home. Walked with staff and reoriented; door alarm functioning.`,
          `Refused all care and medications at ${clock}, stating staff were trying to poison ${ctx.him}. Reapproached by a familiar nurse and accepted medications thirty minutes later.`,
        ]),
        injury: false,
      };
  }
}

// ---------------------------------------------------------------------------------------------
// Care plan goals
// ---------------------------------------------------------------------------------------------

export type GoalTemplate = { goal: string; intervention: string };

/** Goals and interventions by care plan code (from `data/vocabulary/careplans.json`). */
export const GOAL_TEMPLATES: Readonly<Record<string, readonly GoalTemplate[]>> = {
  // Diabetes self management plan
  "735985000": [
    {
      goal: "Fasting blood glucose between 90 and 130 mg/dL",
      intervention:
        "Fingerstick glucose before breakfast and at bedtime; notify physician if above 250 or below 70",
    },
    {
      goal: "No hypoglycemic episodes this quarter",
      intervention:
        "Diabetic diet with mid-morning and afternoon snacks; review insulin timing with meals",
    },
    {
      goal: "Feet inspected daily with no new skin breakdown",
      intervention: "Daily foot check during morning care; podiatry every 90 days",
    },
  ],
  // Lifestyle education regarding hypertension
  "443402002": [
    {
      goal: "Blood pressure below 140/90 on routine checks",
      intervention:
        "Vitals each morning; hold antihypertensive and notify physician if systolic under 100",
    },
    {
      goal: "Sodium intake within the cardiac diet",
      intervention: "Cardiac diet tray; dietitian review monthly",
    },
    {
      goal: "No dizziness on standing",
      intervention: "Rise slowly with assistance; orthostatic blood pressure weekly",
    },
  ],
  // Hyperlipidemia clinical management plan
  "736285004": [
    {
      goal: "LDL cholesterol below 100 mg/dL at next lipid panel",
      intervention: "Statin as ordered; lipid panel every six months",
    },
    {
      goal: "Heart-healthy food choices at each meal",
      intervention: "Cardiac diet; dietitian counseling with family at care conference",
    },
  ],
  // Fracture care
  "385691007": [
    {
      goal: "Weight-bearing as tolerated without pain above 3 of 10",
      intervention: "Scheduled analgesic before therapy; physical therapy five times weekly",
    },
    {
      goal: "Transfers with one-person assist within six weeks",
      intervention: "Gait training with walker; hip precautions reviewed each shift",
    },
    {
      goal: "No falls during recovery",
      intervention: "Bed alarm, non-skid socks, call light within reach, hourly rounding",
    },
  ],
  // Musculoskeletal care
  "408869004": [
    {
      goal: "Joint pain at or below 3 of 10 during daily activities",
      intervention: "Scheduled analgesic; warm packs to affected joints before morning care",
    },
    {
      goal: "Maintains current range of motion",
      intervention: "Restorative range-of-motion exercises three times weekly",
    },
  ],
  // Dementia management
  "386257007": [
    {
      goal: "Fewer than two episodes of agitation per week",
      intervention:
        "Consistent caregivers, structured daily routine, music therapy in the afternoon",
    },
    {
      goal: "Remains safe on the unit without elopement",
      intervention: "Door alarm, photo at nursing station, wander check every hour",
    },
    {
      goal: "Maintains weight within 5 percent of baseline",
      intervention: "Finger foods and cueing at meals; weekly weights",
    },
    {
      goal: "Family updated on cognition and mood monthly",
      intervention: "Nurse calls the primary contact after each physician visit",
    },
  ],
  // Heart failure self management plan
  "735984001": [
    {
      goal: "Weight gain under three pounds in any week",
      intervention: "Daily morning weight; notify physician of a three-pound gain in a week",
    },
    {
      goal: "No shortness of breath at rest",
      intervention: "Head of bed elevated; lung sounds each shift; diuretic as ordered",
    },
    {
      goal: "Fluid intake within the ordered restriction",
      intervention: "Fluid restriction posted at bedside; intake recorded each shift",
    },
  ],
  // COPD clinical management plan
  "736283006": [
    {
      goal: "Oxygen saturation above 90 percent at rest",
      intervention: "Pulse oximetry each shift; inhalers as ordered; pursed-lip breathing coached",
    },
    {
      goal: "No exacerbation requiring hospital transfer this quarter",
      intervention: "Report increased sputum or dyspnea to physician the same day",
    },
  ],
  // Wound care
  "225358003": [
    {
      goal: "Pressure injury reduced in size by 30 percent in four weeks",
      intervention: "Foam dressing changed every three days; weekly wound measurement",
    },
    {
      goal: "No new areas of skin breakdown",
      intervention: "Reposition every two hours; pressure-redistributing mattress; heels floated",
    },
    {
      goal: "Protein intake meets dietitian target",
      intervention: "Protein supplement twice daily; weekly weight",
    },
  ],
  // Cancer care plan
  "736252007": [
    {
      goal: "Pain controlled at or below 3 of 10",
      intervention: "Scheduled and breakthrough analgesics as ordered; pain assessed each shift",
    },
    {
      goal: "Attends oncology appointments as scheduled",
      intervention: "Transport arranged a week ahead; appointment summary filed in chart",
    },
  ],
  // Major depressive disorder clinical management plan
  "737434004": [
    {
      goal: "Attends at least three group activities per week",
      intervention: "Activities staff invite personally; preferred activities listed in care plan",
    },
    {
      goal: "PHQ-9 score improved at next quarterly screen",
      intervention: "Antidepressant as ordered; social work visit every two weeks",
    },
  ],
  // Dialysis care plan
  "736690008": [
    {
      goal: "Attends every scheduled dialysis session",
      intervention:
        "Transport booked for Monday, Wednesday, and Friday; pre-dialysis weight recorded",
    },
    {
      goal: "Fistula site without redness or swelling",
      intervention: "Access site checked each shift; no blood pressure on the access arm",
    },
    {
      goal: "Fluid gain between sessions under two kilograms",
      intervention: "Renal diet with fluid restriction; intake recorded each shift",
    },
  ],
  // Weight management program
  "718361005": [
    {
      goal: "Loses one to two pounds per month",
      intervention: "Portion-controlled tray; walking program with activities staff",
    },
    {
      goal: "Participates in exercise group twice weekly",
      intervention: "Seated exercise group Tuesday and Thursday",
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------------------------

export function appointmentDetails(
  random: Random,
  kind: Enums<"appointment_kind">,
  city: string,
  ctx: ResidentContext,
): { location: string; purpose: string } {
  switch (kind) {
    case "dialysis":
      return { location: `${city} Dialysis Center`, purpose: "Hemodialysis" };
    case "specialist": {
      const options: Array<[string, string]> = [
        [`${city} Cardiology Associates`, "Cardiology follow-up"],
        [`${city} Nephrology`, "Nephrology follow-up"],
        [`${city} Orthopedic Group`, "Orthopedic follow-up"],
        [`${city} Neurology`, "Neurology consultation"],
        [`${city} Dermatology`, "Skin lesion evaluation"],
        [`${city} Urology`, "Urology follow-up"],
        [`${city} Eye Care`, "Ophthalmology follow-up"],
        [`${city} Audiology`, "Hearing aid fitting"],
      ];
      const [location, purpose] = random.pick(options);
      return { location, purpose };
    }
    case "hospital":
      return {
        location: `${city} General Hospital`,
        purpose: random.pick([
          "Outpatient surgery consultation",
          "Pacemaker check",
          "Wound clinic",
          "Infusion clinic",
          ctx.hasHeartFailure ? "Heart failure clinic" : "Pre-procedure evaluation",
        ]),
      };
    case "imaging":
      return {
        location: `${city} Imaging Center`,
        purpose: random.pick([
          "Chest X-ray",
          "Hip X-ray",
          "Bone density scan",
          "Abdominal ultrasound",
          "CT scan of the head",
          "Mammogram",
        ]),
      };
    case "dental":
      return {
        location: `${city} Family Dental`,
        purpose: random.pick(["Denture adjustment", "Dental cleaning", "Extraction"]),
      };
    case "other":
      return {
        location: random.pick([
          `${city} Physical Therapy`,
          `${city} Podiatry`,
          "Veterans Affairs clinic",
        ]),
        purpose: random.pick([
          "Outpatient therapy evaluation",
          "Orthotics fitting",
          "Benefits appointment",
        ]),
      };
  }
}

// ---------------------------------------------------------------------------------------------
// Family contacts and medication instructions
// ---------------------------------------------------------------------------------------------

export function contactNote(
  random: Random,
  relationship: Enums<"family_relationship">,
): string | null {
  if (!random.chance(0.3)) return null;
  const general = [
    "Prefers calls after 6 pm",
    "Visits every Sunday afternoon",
    "Calls the unit most evenings",
    "Holds health care proxy",
    "Lives out of state; call for any change in condition",
    "Brings laundry home on Fridays",
    "Ask for updates by phone rather than voicemail",
  ];
  if (relationship === "daughter" || relationship === "son") {
    return random.pick([...general, "Attends care conferences", "Manages finances and mail"]);
  }
  return random.pick(general);
}

export function medicationInstructions(random: Random, medication: string): string | null {
  const name = medication.toLowerCase();
  if (
    /lisinopril|losartan|amlodipine|metoprolol|carvedilol|hydrochlorothiazide|atenolol/.test(name)
  )
    return "Hold and notify physician if systolic under 100";
  if (/naproxen|ibuprofen/.test(name)) return "Give with food";
  if (/acetaminophen|tylenol/.test(name)) return "For pain or fever, up to every six hours";
  if (/nitroglycerin/.test(name)) return "For chest pain; may repeat once after five minutes";
  if (/tramadol/.test(name)) return "For pain not relieved by acetaminophen";
  if (/alendron/.test(name))
    return "Monday morning with a full glass of water, remain upright 30 minutes";
  if (/warfarin/.test(name)) return "Dose per INR; check INR weekly";
  if (/insulin/.test(name)) return "Give with breakfast and dinner; hold if not eating";
  if (/albuterol/.test(name)) return "For wheezing or shortness of breath";
  if (/furosemide/.test(name)) return "Give in the morning; record daily weight";
  if (/levothyroxine/.test(name)) return "Give before breakfast on an empty stomach";
  if (/digoxin/.test(name)) return "Hold if apical pulse under 60";
  if (/cream/.test(name)) return "Apply thin layer to affected area";
  return random.chance(0.15) ? "Give with a full glass of water" : null;
}
