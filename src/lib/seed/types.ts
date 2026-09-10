import type { DemoAccount } from "../demo-accounts";
import type { Database, Tables } from "../supabase/database.types";

import type { HeroKey } from "./heroes";

export type TableName = keyof Database["public"]["Tables"];

/**
 * A seeded row: every column the generator decides, minus the ones the database fills in
 * (timestamps, soft-delete marker, generated columns).
 */
export type SeedRow<T extends TableName> = Omit<
  Tables<T>,
  "created_at" | "updated_at" | "archived_at" | "abnormal"
>;

export type SeedStaffMember = SeedRow<"staff"> & {
  /** Units this staff member covers (nurses only). */
  unit_ids: string[];
  /** The demo login this staff member signs in with, for the three who can. */
  account: DemoAccount | null;
};

/** The clinical tables, in an order that respects their foreign keys. */
export const CLINICAL_TABLES = [
  "conditions",
  "allergies",
  "medication_orders",
  "administrations",
  "vitals",
  "assessments",
  "lab_results",
  "care_plans",
  "care_plan_goals",
  "incidents",
  "progress_notes",
  "appointments",
  "family_contacts",
] as const satisfies readonly TableName[];

export type ClinicalTable = (typeof CLINICAL_TABLES)[number];

/** A hero resident as seeded: which story, and the resident row it became. */
export type SeedHero = {
  key: HeroKey;
  /** One line for the demo script: what this resident's record shows. */
  story: string;
  resident: SeedRow<"residents">;
};

export type Seed = {
  /** The number the generator was seeded with. */
  seedNumber: number;
  /** The instant "now" was taken to be. Every recent record is placed relative to it. */
  anchor: Date;
  /** The calendar date of `anchor` in the facilities' time zone. */
  anchorDate: string;
  /** The ten hero residents, in the order `heroes.ts` lists them. */
  heroes: SeedHero[];
  facilities: SeedRow<"facilities">[];
  units: SeedRow<"units">[];
  rooms: SeedRow<"rooms">[];
  staff: SeedStaffMember[];
  staff_unit_assignments: SeedRow<"staff_unit_assignments">[];
  residents: SeedRow<"residents">[];
  conditions: SeedRow<"conditions">[];
  allergies: SeedRow<"allergies">[];
  medication_orders: SeedRow<"medication_orders">[];
  administrations: SeedRow<"administrations">[];
  vitals: SeedRow<"vitals">[];
  assessments: SeedRow<"assessments">[];
  lab_results: SeedRow<"lab_results">[];
  care_plans: SeedRow<"care_plans">[];
  care_plan_goals: SeedRow<"care_plan_goals">[];
  incidents: SeedRow<"incidents">[];
  progress_notes: SeedRow<"progress_notes">[];
  appointments: SeedRow<"appointments">[];
  family_contacts: SeedRow<"family_contacts">[];
};
