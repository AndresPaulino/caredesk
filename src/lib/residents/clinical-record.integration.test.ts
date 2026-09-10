/**
 * The resident page's reads, run as the nurse against the seeded hosted project: the record
 * comes back complete and attributed for a resident in scope and empty for one outside it,
 * the assessment summary's last-done and overdue logic holds on known seed residents, and an
 * allergy conflict is flagged the moment an active order names a documented allergen.
 *
 * Skipped without `.env.local`; the conflict test also needs the secret key, which it uses
 * only to remove the order it inserted, since nothing but the service role may delete.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findAllergyConflicts } from "../clinical/allergy-conflicts";
import { summarizeAssessments } from "../clinical/assessment-summary";
import { buildTimeline } from "../clinical/timeline";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import {
  CLINICAL_TABLES,
  buildSeed,
  residentsVisibleTo,
  type ClinicalTable,
  type Seed,
} from "../seed";
import { dateInZone, daysBetween } from "../time";

import { getClinicalRecord } from "./clinical-record";
import { getResident } from "./queries";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const hostedProject = Boolean(url && key && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;

const nurseAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-meadows")!;
const otherNurseAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-harbor")!;

async function signIn(account: DemoAccount): Promise<Client> {
  const client = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`Could not sign in as ${account.email}: ${error.message}`);
  return client;
}

const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id).sort();

const normalize = (summary: ReturnType<typeof summarizeAssessments>) =>
  summary.map((entry) => ({
    ...entry,
    lastDone: entry.lastDone
      ? { ...entry.lastDone, performedAt: new Date(entry.lastDone.performedAt).toISOString() }
      : null,
  }));

describe.skipIf(!hostedProject)("the resident page's reads as the nurse", () => {
  let nurse: Client;
  let seed: Seed;
  let today: string;

  const seedRowsFor = <T extends ClinicalTable>(table: T, residentId: string): Seed[T] =>
    (seed[table] as Array<{ resident_id: string }>).filter(
      (row) => row.resident_id === residentId,
    ) as Seed[T];

  beforeAll(async () => {
    nurse = await signIn(nurseAccount);
    const { data: run, error } = await nurse
      .from("seed_runs")
      .select("seed_number, anchor")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    today = dateInZone(new Date());
  });

  afterAll(async () => {
    await nurse?.auth.signOut();
  });

  it("loads every record type for a resident in scope, attributed to staff", async () => {
    const mine = residentsVisibleTo(seed, nurseAccount).filter((r) => r.status === "current");
    // The resident with the fullest chart, so every table has something to compare.
    const resident = mine
      .map((row) => ({
        row,
        size: CLINICAL_TABLES.reduce((n, t) => n + seedRowsFor(t, row.id).length, 0),
      }))
      .sort((a, b) => b.size - a.size)[0].row;

    expect(await getResident(nurse, resident.id)).toMatchObject({ id: resident.id });
    const record = await getClinicalRecord(nurse, resident.id);

    for (const table of CLINICAL_TABLES) {
      const expected = seedRowsFor(table, resident.id);
      const actual =
        table === "care_plan_goals"
          ? record.care_plans.flatMap((plan) => plan.goals)
          : record[table];
      expect(ids(actual), table).toEqual(ids(expected));
    }

    const staffById = new Map(seed.staff.map((member) => [member.id, member]));
    for (const assessment of record.assessments) {
      const expected = staffById.get(assessment.performed_by)!;
      expect(assessment.staff).toMatchObject({
        id: expected.id,
        first_name: expected.first_name,
        last_name: expected.last_name,
      });
    }
    expect(record.assessments.map((row) => row.performed_at)).toEqual(
      [...record.assessments.map((row) => row.performed_at)].sort().reverse(),
    );

    const timeline = buildTimeline(record);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline.every((entry) => entry.type !== "lab_results" || entry.staff)).toBe(true);
  });

  it("finds nothing for a resident outside scope", async () => {
    const theirs = residentsVisibleTo(seed, otherNurseAccount)[0];
    expect(await getResident(nurse, theirs.id)).toBeNull();
    const record = await getClinicalRecord(nurse, theirs.id);
    for (const table of CLINICAL_TABLES) {
      if (table === "care_plan_goals") continue;
      expect(record[table], table).toEqual([]);
    }
  });

  it("states last done and next due per kind and marks overdue kinds on known residents", async () => {
    const mine = residentsVisibleTo(seed, nurseAccount).filter((r) => r.status === "current");
    const expectedFor = (residentId: string) =>
      summarizeAssessments(seedRowsFor("assessments", residentId), {
        today,
        residentStatus: "current",
      });

    // The seed leaves about a fifth of residents overdue for something; find one, and one who is not.
    const overdue = mine.find((row) =>
      expectedFor(row.id).some((entry) => entry.status === "overdue" && entry.lastDone),
    );
    const upToDate = mine.find((row) =>
      expectedFor(row.id).every((entry) => entry.status !== "overdue"),
    );
    expect(overdue, "a seeded resident overdue for an assessment").toBeDefined();
    expect(upToDate, "a seeded resident with nothing overdue").toBeDefined();

    for (const resident of [overdue!, upToDate!]) {
      const record = await getClinicalRecord(nurse, resident.id);
      const summary = summarizeAssessments(record.assessments, {
        today,
        residentStatus: "current",
      });
      // The database writes timestamps as "+00:00" and the seed as "Z"; compare the instants.
      expect(normalize(summary)).toEqual(normalize(expectedFor(resident.id)));

      for (const entry of summary) {
        const latest = seedRowsFor("assessments", resident.id)
          .filter((row) => row.kind === entry.kind)
          .sort((a, b) => b.performed_at.localeCompare(a.performed_at))[0];
        expect(entry.lastDone?.id ?? null, entry.kind).toBe(latest?.id ?? null);
        if (entry.lastDone) {
          const daysSince = daysBetween(entry.lastDone.performedOn, today);
          expect(entry.status === "overdue", `${entry.kind} after ${daysSince} days`).toBe(
            daysSince > entry.dueEveryDays,
          );
        }
      }
    }

    const flagged = summarizeAssessments(
      (await getClinicalRecord(nurse, overdue!.id)).assessments,
      {
        today,
        residentStatus: "current",
      },
    ).filter((entry) => entry.status === "overdue");
    expect(flagged.length).toBeGreaterThan(0);
    expect(
      summarizeAssessments((await getClinicalRecord(nurse, upToDate!.id)).assessments, {
        today,
        residentStatus: "current",
      }).filter((entry) => entry.status === "overdue"),
    ).toEqual([]);
  });

  describe.skipIf(!secretKey)("allergy conflicts", () => {
    it("flags none in the seed, then flags an active order that names a documented allergen", async () => {
      const mine = residentsVisibleTo(seed, nurseAccount).filter((r) => r.status === "current");
      const allergy = seed.allergies.find(
        (row) => row.substance && mine.some((resident) => resident.id === row.resident_id),
      )!;
      expect(allergy, "a seeded resident in scope with a medication allergy").toBeDefined();
      const resident = mine.find((row) => row.id === allergy.resident_id)!;
      const physician = seed.staff.find(
        (member) => member.role === "physician" && member.facility_id === resident.facility_id,
      )!;

      const before = await getClinicalRecord(nurse, resident.id);
      expect(findAllergyConflicts(before.allergies, before.medication_orders)).toEqual([]);

      const substance = allergy.substance!;
      const medication = `${substance[0].toUpperCase()}${substance.slice(1)} 250 MG Oral Tablet`;
      const inserted = await nurse
        .from("medication_orders")
        .insert({
          resident_id: resident.id,
          code: "test",
          medication,
          frequency: "once_daily",
          prescribed_by: physician.id,
          started_on: today,
        })
        .select("id")
        .single();
      expect(inserted.error).toBeNull();
      const orderId = inserted.data!.id;

      try {
        const after = await getClinicalRecord(nurse, resident.id);
        const conflicts = findAllergyConflicts(after.allergies, after.medication_orders);
        expect(conflicts).toEqual([
          expect.objectContaining({
            allergyId: allergy.id,
            orderId,
            substance,
            medication,
            allergy: allergy.description,
          }),
        ]);
      } finally {
        // Only the service role may remove a row; the test leaves the seed as it found it,
        // audit trail included, with the skip flag the seeder uses (docs/database.md).
        const serviceRole = createClient<Database>(url!, secretKey!, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { "x-caredesk-audit": "skip" } },
        });
        const removed = await serviceRole.from("medication_orders").delete().eq("id", orderId);
        expect(removed.error).toBeNull();
        const cleared = await serviceRole.from("audit_events").delete().eq("record_id", orderId);
        expect(cleared.error).toBeNull();
      }
    });
  });
});
