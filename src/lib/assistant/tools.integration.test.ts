/**
 * The assistant's core tools, run as the nurse and the admin against the seeded hosted project
 * with no model involved: scope (the Meadows nurse finds Harold Doe and not Walter, the admin
 * finds both, and every tool comes back empty-handed for a resident outside scope),
 * correctness (the latest podiatry assessment for the hero Doe is the authored date, overdue),
 * and shape (every result carries the resident and tab a source chip links to, and every record
 * its id).
 *
 * Skipped without `.env.local`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import { HERO_BY_KEY, buildSeed, heroResidentId, type Seed } from "../seed";
import { dateInZone, daysBetween } from "../time";

import {
  FIND_RESIDENTS_LIMIT,
  findResidents,
  getAllergies,
  getAssessments,
  getMedicationOrders,
  getResidentSummary,
  getVitals,
  type ToolContext,
} from "./tools";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const hostedProject = Boolean(url && key && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;

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

const harold = heroResidentId("doe-meadows");
const walter = heroResidentId("doe-harbor");
const margaret = heroResidentId("allergy-conflict");

const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id).sort();

describe.skipIf(!hostedProject)("the assistant's core tools on the hosted project", () => {
  const contexts = new Map<DemoAccount["key"], ToolContext>();
  const as = (account: DemoAccount["key"]) => contexts.get(account)!;
  let seed: Seed;
  let today: string;

  beforeAll(async () => {
    const now = new Date();
    for (const demo of DEMO_ACCOUNTS) {
      contexts.set(demo.key, { supabase: await signIn(demo), now });
    }
    const { data: run, error } = await as("admin")
      .supabase.from("seed_runs")
      .select("seed_number, anchor")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    today = dateInZone(now);
  });

  afterAll(async () => {
    for (const context of contexts.values()) await context.supabase.auth.signOut();
  });

  describe("find_residents", () => {
    it("finds the one Doe in the nurse's scope, and both for the admin", async () => {
      const meadows = await findResidents(as("nurse-meadows"), { query: "Mr. Doe" });
      expect(meadows.total).toBe(1);
      expect(meadows.matches).toEqual([
        expect.objectContaining({
          id: harold,
          name: "Harold Doe",
          status: "current",
          facility: expect.stringContaining("Meadows"),
          room: "104",
          stayEnded: null,
        }),
      ]);

      const harbor = await findResidents(as("nurse-harbor"), { query: "Doe" });
      expect(harbor.matches.map((match) => match.id)).toEqual([walter]);

      const admin = await findResidents(as("admin"), { query: "Doe" });
      expect(admin.total).toBe(2);
      expect(admin.matches.map((match) => match.name)).toEqual(["Harold Doe", "Walter Doe"]);
    });

    it("narrows by full name, room number, unit, and facility", async () => {
      const admin = as("admin");
      expect(ids((await findResidents(admin, { query: "Harold Doe's" })).matches)).toEqual([
        harold,
      ]);
      expect(ids((await findResidents(admin, { query: "Doe", facility: "HBR" })).matches)).toEqual([
        walter,
      ]);
      expect(
        ids((await findResidents(admin, { query: "Doe", facility: "Meadows" })).matches),
      ).toEqual([harold]);
      expect(ids((await findResidents(admin, { query: "Doe", unit: "A" })).matches)).toEqual([
        harold,
      ]);
      const byRoom = await findResidents(as("nurse-meadows"), { query: "room 104" });
      expect(byRoom.matches.map((match) => match.id)).toContain(harold);
    });

    it("caps the matches and reports the total, and finds nothing for a blank query", async () => {
      const common = await findResidents(as("admin"), { query: "a", status: "current" });
      expect(common.matches.length).toBe(FIND_RESIDENTS_LIMIT);
      expect(common.total).toBeGreaterThan(FIND_RESIDENTS_LIMIT);
      expect(await findResidents(as("admin"), { query: "Mrs." })).toEqual({
        query: "Mrs.",
        matches: [],
        total: 0,
      });
    });
  });

  describe("scope", () => {
    it("finds nothing for the other facility's Doe as the Meadows nurse, everything as the admin", async () => {
      const nurse = as("nurse-meadows");
      expect(await getResidentSummary(nurse, { residentId: walter })).toBeNull();
      expect(await getAssessments(nurse, { residentId: walter })).toBeNull();
      expect(await getMedicationOrders(nurse, { residentId: walter })).toBeNull();
      expect(await getVitals(nurse, { residentId: walter })).toBeNull();
      expect(await getAllergies(nurse, { residentId: walter })).toBeNull();

      const admin = as("admin");
      for (const residentId of [harold, walter]) {
        expect((await getResidentSummary(admin, { residentId }))?.resident.id).toBe(residentId);
        expect((await getAssessments(admin, { residentId }))?.assessments.length).toBeGreaterThan(
          0,
        );
      }
    });
  });

  describe("correctness on the hero Doe", () => {
    it("states the latest podiatry assessment's date and that it is overdue", async () => {
      const result = await getAssessments(as("nurse-meadows"), {
        residentId: harold,
        kind: "podiatry",
      });
      expect(result).not.toBeNull();

      const authored = HERO_BY_KEY.get("doe-meadows")!.assessments!.filter(
        (assessment) => assessment.kind === "podiatry",
      );
      const expected = seed.assessments
        .filter((row) => row.resident_id === harold && row.kind === "podiatry")
        .sort((a, b) => b.performed_at.localeCompare(a.performed_at));
      expect(expected).toHaveLength(authored.length);

      expect(result!.summary).toHaveLength(1);
      const [podiatry] = result!.summary;
      expect(podiatry.kind).toBe("podiatry");
      expect(podiatry.lastDone).toEqual({
        id: expected[0].id,
        performedOn: dateInZone(new Date(expected[0].performed_at)),
        daysAgo: daysBetween(dateInZone(new Date(expected[0].performed_at)), today),
      });
      // Authored 131 days before the anchor; reseeded today, so 131 days ago.
      expect(daysBetween(podiatry.lastDone!.performedOn, seed.anchorDate)).toBe(
        Math.min(...authored.map((assessment) => assessment.daysAgo)),
      );
      expect(podiatry.status).toBe("overdue");
      expect(podiatry.daysUntilDue).toBeLessThan(0);
      expect(podiatry.nextDue).not.toBeNull();

      expect(result!.assessments.map((row) => row.id)).toEqual(expected.map((row) => row.id));
      expect(result!.assessments[0]).toMatchObject({
        kindName: "Podiatry",
        performedBy: expect.stringMatching(/\w/),
        findings: expect.stringContaining("Return in 90 days"),
      });
      expect(result!.total).toBe(expected.length);
    });

    it("summarizes every kind when no kind is given, newest first", async () => {
      const result = await getAssessments(as("nurse-meadows"), { residentId: harold, limit: 3 });
      expect(result!.summary.map((entry) => entry.kind)).toContain("physician_visit");
      expect(result!.summary.find((entry) => entry.kind === "physician_visit")?.status).toBe(
        "up_to_date",
      );
      expect(result!.assessments).toHaveLength(3);
      expect(result!.assessments.map((row) => row.performedAt)).toEqual(
        [...result!.assessments.map((row) => row.performedAt)].sort().reverse(),
      );
      expect(result!.total).toBe(
        seed.assessments.filter((row) => row.resident_id === harold).length,
      );
    });

    it("reads the summary with conditions, the orders with administrations, vitals, and allergies", async () => {
      const nurse = as("nurse-meadows");

      const summary = await getResidentSummary(nurse, { residentId: harold });
      expect(summary!.resident).toMatchObject({
        name: "Harold Doe",
        room: "104",
        codeStatus: "DNR",
        diet: "Diabetic",
        mobility: "Walker",
        status: "current",
      });
      expect(ids(summary!.conditions)).toEqual(
        ids(seed.conditions.filter((row) => row.resident_id === harold)),
      );

      const orders = await getMedicationOrders(nurse, { residentId: harold, status: "all" });
      const seededOrders = seed.medication_orders.filter((row) => row.resident_id === harold);
      expect(ids(orders!.orders)).toEqual(ids(seededOrders));
      const metformin = orders!.orders.find((order) => /metformin/i.test(order.medication))!;
      expect(metformin.treats?.description).toMatch(/diabetes/i);
      expect(metformin.frequency).toBe("Once daily");
      expect(metformin.recentAdministrations.length).toBeGreaterThan(0);
      expect(metformin.lastGivenAt).not.toBeNull();
      expect(metformin.recentAdministrations.every((administration) => administration.id)).toBe(
        true,
      );
      const active = await getMedicationOrders(nurse, { residentId: harold });
      expect(active!.orders.every((order) => order.status === "Active")).toBe(true);

      const vitals = await getVitals(nurse, { residentId: harold, limit: 5 });
      const seededVitals = seed.vitals
        .filter((row) => row.resident_id === harold)
        .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
      expect(vitals!.vitals).toHaveLength(Math.min(5, seededVitals.length));
      expect(vitals!.total).toBeGreaterThanOrEqual(seededVitals.length);
      expect(vitals!.vitals[0]).toMatchObject({
        bloodPressure: expect.stringMatching(/^\d+\/\d+$/),
        outOfRange: expect.any(Array),
      });

      const allergies = await getAllergies(nurse, { residentId: margaret });
      expect(allergies!.allergies).toEqual([
        expect.objectContaining({
          substance: "sulfamethoxazole",
          category: "Medication",
          severity: "Moderate",
        }),
      ]);
    });
  });

  describe("shape for source chips", () => {
    it("names the resident and the record tab on every result, and every record carries its id", async () => {
      const nurse = as("nurse-meadows");
      const source = { residentId: harold, residentName: "Harold Doe" };

      const summary = await getResidentSummary(nurse, { residentId: harold });
      expect(summary!.source).toEqual({ ...source, tab: null });

      const assessments = await getAssessments(nurse, { residentId: harold });
      expect(assessments!.source).toEqual({ ...source, tab: null });
      expect(assessments!.assessments.every((row) => row.id)).toBe(true);

      const orders = await getMedicationOrders(nurse, { residentId: harold });
      expect(orders!.source).toEqual({ ...source, tab: "medications" });
      expect(orders!.orders.every((row) => row.id)).toBe(true);

      const vitals = await getVitals(nurse, { residentId: harold });
      expect(vitals!.source).toEqual({ ...source, tab: "vitals" });
      expect(vitals!.vitals.every((row) => row.id)).toBe(true);

      const allergies = await getAllergies(nurse, { residentId: harold });
      expect(allergies!.source).toEqual({ ...source, tab: "allergies" });
      expect(allergies!.allergies.every((row) => row.id)).toBe(true);

      const found = await findResidents(nurse, { query: "Doe" });
      expect(found.matches.every((match) => match.id && match.name)).toBe(true);
    });
  });
});
