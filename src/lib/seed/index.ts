/**
 * The seed: the whole Willowbrook Care dataset, generated deterministically from the committed
 * clinical vocabulary (ADR 0002). The same seed number and anchor instant always produce the
 * same rows with the same ids.
 *
 *   buildSeed()                                   // now, rounded down to the hour
 *   buildSeed({ seed: 7, anchor: new Date(...) }) // pinned, as the tests do
 *
 * Recent records are placed relative to the anchor so a fresh reseed always has something due
 * today, overdue since last week, and scheduled for tomorrow. Ids do not depend on the anchor,
 * so links keep working from one reseed to the next.
 */
import type { DemoAccount } from "../demo-accounts";

import { buildOrganization } from "./organization";
import { createRandom } from "./random";
import { buildRecords } from "./records";
import { buildResidents } from "./residents";
import { dateInZone } from "../time";
import { CLINICAL_TABLES, type ClinicalTable, type Seed } from "./types";

export type { ClinicalTable, Seed, SeedRow, SeedStaffMember, TableName } from "./types";
export { CLINICAL_TABLES } from "./types";
export { stableId } from "./random";

export const DEFAULT_SEED_NUMBER = 20260909;

export type BuildSeedOptions = {
  seed?: number;
  anchor?: Date;
};

/** "Now" for the generator: the current instant, rounded down to the hour. */
export function defaultAnchor(now: Date = new Date()): Date {
  const anchor = new Date(now);
  anchor.setUTCMinutes(0, 0, 0);
  return anchor;
}

export function buildSeed(options: BuildSeedOptions = {}): Seed {
  const seedNumber = options.seed ?? DEFAULT_SEED_NUMBER;
  const anchor = options.anchor ?? defaultAnchor();
  const anchorDate = dateInZone(anchor);

  const random = createRandom(seedNumber);
  const organization = buildOrganization(random);
  const profiles = buildResidents(random, organization, anchor, anchorDate);
  const records = buildRecords(profiles, organization, anchor, anchorDate);

  return {
    seedNumber,
    anchor,
    anchorDate,
    facilities: organization.facilities,
    units: organization.units,
    rooms: organization.rooms,
    staff: organization.staff,
    staff_unit_assignments: organization.assignments,
    residents: profiles.map((profile) => profile.row),
    ...records,
  };
}

/** The spec's target row counts. The generator lands within twenty percent of each. */
export const ROW_BUDGET = {
  residents: 1000,
  conditions: 4000,
  allergies: 1200,
  medication_orders: 6000,
  administrations: 10_000,
  vitals: 12_000,
  assessments: 8000,
  lab_results: 4000,
  care_plans_and_goals: 2500,
  incidents: 800,
  progress_notes: 5000,
  appointments: 1500,
  family_contacts: 1800,
} as const;

export type RowCounts = Record<keyof typeof ROW_BUDGET, number>;

export function rowCounts(seed: Seed): RowCounts {
  return {
    residents: seed.residents.length,
    conditions: seed.conditions.length,
    allergies: seed.allergies.length,
    medication_orders: seed.medication_orders.length,
    administrations: seed.administrations.length,
    vitals: seed.vitals.length,
    assessments: seed.assessments.length,
    lab_results: seed.lab_results.length,
    care_plans_and_goals: seed.care_plans.length + seed.care_plan_goals.length,
    incidents: seed.incidents.length,
    progress_notes: seed.progress_notes.length,
    appointments: seed.appointments.length,
    family_contacts: seed.family_contacts.length,
  };
}

/** Every row of the seed, by table, in an order the database accepts. */
export function tableRowCounts(seed: Seed): Record<string, number> {
  const counts: Record<string, number> = {
    facilities: seed.facilities.length,
    units: seed.units.length,
    rooms: seed.rooms.length,
    staff: seed.staff.length,
    staff_unit_assignments: seed.staff_unit_assignments.length,
    residents: seed.residents.length,
  };
  for (const table of CLINICAL_TABLES) counts[table] = seed[table].length;
  return counts;
}

/** The residents a demo account may see, by the scope rule, computed from the seed itself. */
export function scopedResidentIds(seed: Seed, account: DemoAccount): Set<string> {
  if (account.role === "admin") return new Set(seed.residents.map((resident) => resident.id));
  const member = seed.staff.find((staff) => staff.account?.key === account.key);
  if (!member) throw new Error(`No seeded staff for ${account.key}`);
  const unitIds = new Set(member.unit_ids);
  return new Set(
    seed.residents.filter((resident) => unitIds.has(resident.unit_id)).map((r) => r.id),
  );
}

export function residentsVisibleTo(seed: Seed, account: DemoAccount): Seed["residents"] {
  const ids = scopedResidentIds(seed, account);
  return seed.residents.filter((resident) => ids.has(resident.id));
}

/** The rows of one clinical table a demo account may see: those whose resident is in scope. */
export function rowsVisibleTo<T extends ClinicalTable>(
  seed: Seed,
  table: T,
  account: DemoAccount,
): Seed[T] {
  const ids = scopedResidentIds(seed, account);
  const rows: Array<{ resident_id: string }> = seed[table];
  return rows.filter((row) => ids.has(row.resident_id)) as Seed[T];
}
