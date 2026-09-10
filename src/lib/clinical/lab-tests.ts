/**
 * The laboratory tests CareDesk records, keyed by LOINC code, with the reference range shown
 * beside each result. Codes match entries in the clinical vocabulary (`data/vocabulary/
 * observations.json`), which is where the seed draws values from. Reference ranges are the
 * usual adult ranges; they are display and flagging conventions, not clinical advice.
 */

export type LabTest = {
  code: string;
  description: string;
  units: string;
  referenceLow: number | null;
  referenceHigh: number | null;
  /** Decimal places a result is reported with. */
  decimals: number;
};

export type LabPanel = {
  key: "metabolic" | "blood_count" | "lipids" | "a1c" | "inr";
  name: string;
  tests: readonly LabTest[];
};

export const LAB_PANELS: readonly LabPanel[] = [
  {
    key: "metabolic",
    name: "Basic metabolic panel",
    tests: [
      {
        code: "2339-0",
        description: "Glucose",
        units: "mg/dL",
        referenceLow: 70,
        referenceHigh: 99,
        decimals: 0,
      },
      {
        code: "6299-2",
        description: "Urea nitrogen",
        units: "mg/dL",
        referenceLow: 7,
        referenceHigh: 20,
        decimals: 0,
      },
      {
        code: "38483-4",
        description: "Creatinine",
        units: "mg/dL",
        referenceLow: 0.6,
        referenceHigh: 1.2,
        decimals: 1,
      },
      {
        code: "2947-0",
        description: "Sodium",
        units: "mmol/L",
        referenceLow: 135,
        referenceHigh: 145,
        decimals: 0,
      },
      {
        code: "6298-4",
        description: "Potassium",
        units: "mmol/L",
        referenceLow: 3.5,
        referenceHigh: 5.1,
        decimals: 1,
      },
    ],
  },
  {
    key: "blood_count",
    name: "Complete blood count",
    tests: [
      {
        code: "718-7",
        description: "Hemoglobin",
        units: "g/dL",
        referenceLow: 12,
        referenceHigh: 16,
        decimals: 1,
      },
      {
        code: "6690-2",
        description: "Leukocytes",
        units: "10*3/uL",
        referenceLow: 4.5,
        referenceHigh: 11,
        decimals: 1,
      },
      {
        code: "777-3",
        description: "Platelets",
        units: "10*3/uL",
        referenceLow: 150,
        referenceHigh: 400,
        decimals: 0,
      },
      {
        code: "4544-3",
        description: "Hematocrit",
        units: "%",
        referenceLow: 36,
        referenceHigh: 48,
        decimals: 1,
      },
    ],
  },
  {
    key: "lipids",
    name: "Lipid panel",
    tests: [
      {
        code: "2093-3",
        description: "Total cholesterol",
        units: "mg/dL",
        referenceLow: null,
        referenceHigh: 200,
        decimals: 0,
      },
      {
        code: "2571-8",
        description: "Triglycerides",
        units: "mg/dL",
        referenceLow: null,
        referenceHigh: 150,
        decimals: 0,
      },
      {
        code: "18262-6",
        description: "LDL cholesterol",
        units: "mg/dL",
        referenceLow: null,
        referenceHigh: 100,
        decimals: 0,
      },
      {
        code: "2085-9",
        description: "HDL cholesterol",
        units: "mg/dL",
        referenceLow: 40,
        referenceHigh: null,
        decimals: 0,
      },
    ],
  },
  {
    key: "a1c",
    name: "Hemoglobin A1c",
    tests: [
      {
        code: "4548-4",
        description: "Hemoglobin A1c",
        units: "%",
        referenceLow: 4,
        referenceHigh: 5.6,
        decimals: 1,
      },
    ],
  },
  {
    key: "inr",
    name: "INR",
    tests: [
      {
        code: "6301-6",
        description: "INR",
        units: "{INR}",
        referenceLow: 0.8,
        referenceHigh: 1.2,
        decimals: 1,
      },
    ],
  },
];

export const LAB_PANEL_BY_KEY: ReadonlyMap<LabPanel["key"], LabPanel> = new Map(
  LAB_PANELS.map((panel) => [panel.key, panel]),
);
