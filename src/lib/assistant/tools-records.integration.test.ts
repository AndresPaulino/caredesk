/**
 * The assistant's record, audit, and conflict tools, run as the nurse and the admin against
 * the seeded hosted project with no model involved: scope (every tool comes back empty-handed
 * for the other facility's Doe as the Meadows nurse, and answers for both Does as the admin),
 * correctness (the hero with two falls, the daughter who calls, the readmitted resident's
 * hospital stay, the one allergy conflict in the seed on the hero who has it, and a change a
 * user just made showing in the audit trail and in the unit's activity), and shape (every
 * result carries the resident and tab a source chip links to).
 *
 * Skipped without `.env.local`. Writes one progress note as the nurse and removes it, and the
 * audit events it produced, with the service role when done.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { describeHosted } from "../../test/hosted-project";
import { writeProgressNote } from "../care/record";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import { buildSeed, heroResidentId, type Seed } from "../seed";
import { dateInZone } from "../time";

import {
  checkAllergyConflicts,
  getAppointments,
  getAuditTrailForAssistant,
  getFamilyContacts,
  getIncidents,
  getLabResults,
  getProgressNotes,
  getRecentActivity,
  type ToolContext,
} from "./tools";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

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
const eugene = heroResidentId("falls");
const rose = heroResidentId("dementia");
const frank = heroResidentId("readmitted");

const ids = (rows: ReadonlyArray<{ id: string }>) => rows.map((row) => row.id).sort();

describeHosted("the assistant's record and audit tools", { secretKey: true }, () => {
  const contexts = new Map<DemoAccount["key"], ToolContext>();
  const as = (account: DemoAccount["key"]) => contexts.get(account)!;
  let seed: Seed;
  let today: string;
  let nurseStaffId: string;
  let noteId: string | null = null;

  beforeAll(async () => {
    const now = new Date();
    for (const demo of DEMO_ACCOUNTS) {
      contexts.set(demo.key, { supabase: await signIn(demo), now });
    }
    const admin = as("admin").supabase;
    const { data: run, error } = await admin
      .from("seed_runs")
      .select("seed_number, anchor")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    today = dateInZone(now);

    const nurse = as("nurse-meadows").supabase;
    const { data: user } = await nurse.auth.getUser();
    const { data: staff } = await nurse
      .from("staff")
      .select("id")
      .eq("auth_user_id", user.user!.id)
      .single();
    nurseStaffId = staff!.id;
  });

  afterAll(async () => {
    if (noteId) {
      const unaudited = createClient<Database>(url!, secretKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { "x-caredesk-audit": "skip" } },
      });
      await unaudited.from("audit_events").delete().eq("record_id", noteId);
      await unaudited.from("progress_notes").delete().eq("id", noteId);
    }
    for (const context of contexts.values()) await context.supabase.auth.signOut();
  });

  describe("scope", () => {
    it("finds nothing for the other facility's Doe as the Meadows nurse, everything as the admin", async () => {
      const nurse = as("nurse-meadows");
      expect(await getLabResults(nurse, { residentId: walter })).toBeNull();
      expect(await getIncidents(nurse, { residentId: walter })).toBeNull();
      expect(await getProgressNotes(nurse, { residentId: walter })).toBeNull();
      expect(await getAppointments(nurse, { residentId: walter })).toBeNull();
      expect(await getFamilyContacts(nurse, { residentId: walter })).toBeNull();
      expect(await getAuditTrailForAssistant(nurse, { residentId: walter })).toBeNull();
      expect(await checkAllergyConflicts(nurse, { residentId: walter })).toBeNull();

      const admin = as("admin");
      for (const residentId of [harold, walter]) {
        expect((await getLabResults(admin, { residentId }))?.source.residentId).toBe(residentId);
        expect((await getFamilyContacts(admin, { residentId }))?.source.residentId).toBe(
          residentId,
        );
        expect((await getAuditTrailForAssistant(admin, { residentId }))?.source).toEqual({
          residentId,
          residentName: expect.stringMatching(/Doe$/),
          tab: "audit",
        });
      }
    });

    it("keeps unit-wide checks to the units the nurse covers", async () => {
      const harbor = await checkAllergyConflicts(as("nurse-meadows"), { facility: "Harbor" });
      expect(harbor).toMatchObject({ mode: "scope", residentsChecked: 0 });
      expect(harbor!.mode === "scope" && harbor!.scope.facilities).toEqual([]);

      const unitZ = await checkAllergyConflicts(as("nurse-meadows"), { unit: "Z" });
      expect(unitZ).toMatchObject({
        mode: "scope",
        residentsChecked: 0,
        residentsWithConflicts: [],
      });
    });
  });

  describe("records on the hero residents", () => {
    it("lists lab results with the latest of each test, and narrows by test name", async () => {
      const result = await getLabResults(as("nurse-meadows"), { residentId: harold });
      const expected = seed.lab_results.filter((row) => row.resident_id === harold);
      expect(result!.source).toEqual({
        residentId: harold,
        residentName: "Harold Doe",
        tab: "labs",
      });
      expect(result!.total).toBe(expected.length);
      expect(ids(result!.results)).toEqual(ids(expected));
      expect(result!.latestByTest).toHaveLength(new Set(expected.map((row) => row.code)).size);
      for (const entry of result!.latestByTest) {
        expect(entry.latest.code).toBe(entry.code);
        if (entry.previous) expect(entry.previous.resultedOn <= entry.latest.resultedOn).toBe(true);
      }

      const [first] = result!.results;
      const narrowed = await getLabResults(as("nurse-meadows"), {
        residentId: harold,
        test: first.test.slice(0, 5),
      });
      expect(narrowed!.results.length).toBeGreaterThan(0);
      expect(
        narrowed!.results.every((row) =>
          row.test.toLowerCase().includes(first.test.slice(0, 5).toLowerCase()),
        ),
      ).toBe(true);
    });

    it("counts the falls hero's two falls in the last thirty days", async () => {
      const result = await getIncidents(as("nurse-meadows"), { residentId: eugene });
      const expected = seed.incidents.filter((row) => row.resident_id === eugene);
      expect(result!.source.tab).toBe("incidents");
      expect(ids(result!.incidents)).toEqual(ids(expected));
      expect(result!.fallsInLast30Days).toBe(2);
      expect(result!.incidents[0]).toMatchObject({
        kind: "fall",
        kindName: "Fall",
        reportedBy: expect.stringMatching(/\w/),
      });

      const falls = await getIncidents(as("nurse-meadows"), { residentId: eugene, kind: "fall" });
      expect(falls!.incidents.every((row) => row.kind === "fall")).toBe(true);
      expect(falls!.total).toBe(expected.filter((row) => row.kind === "fall").length);
    });

    it("finds the notes about the dementia hero's daughter by name", async () => {
      const result = await getProgressNotes(as("nurse-meadows"), {
        residentId: rose,
        search: "Teresa",
        limit: 50,
      });
      const expected = seed.progress_notes.filter(
        (row) => row.resident_id === rose && row.body.includes("Teresa"),
      );
      expect(expected.length).toBeGreaterThanOrEqual(3);
      expect(result!.source.tab).toBe("notes");
      expect(ids(result!.notes)).toEqual(ids(expected));
      expect(result!.total).toBe(expected.length);
      expect(result!.notes[0].writtenBy).toMatch(/\w/);

      const contacts = await getFamilyContacts(as("nurse-meadows"), { residentId: rose });
      expect(contacts!.source.tab).toBe("family");
      expect(contacts!.primaryContact).toMatchObject({
        firstName: "Teresa",
        relationship: "Daughter",
        isPrimary: true,
      });
      expect(contacts!.contacts[0].id).toBe(contacts!.primaryContact!.id);
    });

    it("shows the readmitted hero's hospital stay and the dialysis hero's next session", async () => {
      const harbor = as("nurse-harbor");
      const hospital = await getAppointments(harbor, {
        residentId: frank,
        kind: "hospital",
        window: "past",
      });
      const expected = seed.appointments.filter(
        (row) => row.resident_id === frank && row.kind === "hospital",
      );
      expect(hospital!.source.tab).toBe("appointments");
      expect(ids(hospital!.appointments)).toEqual(ids(expected));
      expect(hospital!.appointments[0]).toMatchObject({
        kindName: "Hospital",
        status: "Completed",
        location: expect.stringContaining("Hospital"),
      });
      expect(hospital!.appointments[0].daysFromNow).toBeLessThan(0);

      const dialysis = await getAppointments(harbor, {
        residentId: walter,
        kind: "dialysis",
        window: "upcoming",
      });
      expect(dialysis!.appointments.length).toBeGreaterThan(0);
      expect(dialysis!.appointments.map((row) => row.scheduledAt)).toEqual(
        [...dialysis!.appointments.map((row) => row.scheduledAt)].sort(),
      );
      expect(dialysis!.nextScheduled).not.toBeNull();
      expect(dialysis!.nextScheduled!.scheduledAt <= dialysis!.appointments[0].scheduledAt).toBe(
        true,
      );
    });
  });

  describe("the allergy conflict check", () => {
    it("finds the one conflict in the seed on the hero who has it, for a resident, a unit, and the operator", async () => {
      const nurse = as("nurse-meadows");
      const one = await checkAllergyConflicts(nurse, { residentId: margaret });
      expect(one!.mode).toBe("resident");
      if (one!.mode !== "resident") return;
      expect(one!.source).toEqual({
        residentId: margaret,
        residentName: "Margaret Kowalski",
        tab: "medications",
      });
      expect(one!.conflicts).toHaveLength(1);
      expect(one!.conflicts[0]).toMatchObject({
        substance: "sulfamethoxazole",
        medication: expect.stringMatching(/sulfamethoxazole/i),
        severity: "Moderate",
      });

      const unitB = await checkAllergyConflicts(nurse, { unit: "B" });
      expect(unitB!.mode).toBe("scope");
      if (unitB!.mode !== "scope") return;
      expect(unitB!.scope.units).toEqual(["Unit B at Willowbrook Meadows"]);
      expect(unitB!.residentsChecked).toBeGreaterThan(20);
      expect(unitB!.residentsWithConflicts.map((row) => row.name)).toEqual(["Margaret Kowalski"]);
      expect(unitB!.residentsWithConflicts[0].room).toBe("218");
      expect(unitB!.sources).toEqual([
        { residentId: margaret, residentName: "Margaret Kowalski", tab: "medications" },
      ]);

      const unitA = await checkAllergyConflicts(nurse, { unit: "A" });
      expect(unitA!.mode === "scope" && unitA!.residentsWithConflicts).toEqual([]);

      const everyone = await checkAllergyConflicts(as("admin"), {});
      expect(everyone!.mode === "scope" && everyone!.residentsChecked).toBe(
        seed.residents.filter((row) => row.status === "current").length,
      );
      expect(everyone!.mode === "scope" && ids(everyone!.residentsWithConflicts)).toEqual([
        margaret,
      ]);

      const everyUnitB = await checkAllergyConflicts(as("admin"), { unit: "B" });
      expect(everyUnitB!.mode === "scope" && everyUnitB!.scope.units).toHaveLength(6);
      expect(everyUnitB!.mode === "scope" && ids(everyUnitB!.residentsWithConflicts)).toEqual([
        margaret,
      ]);
    });
  });

  describe("the audit tools", () => {
    it("return a change a user just made, in the resident's trail and in the unit's activity", async () => {
      const nurse = as("nurse-meadows");
      const written = await writeProgressNote(nurse.supabase, { staffId: nurseStaffId }, harold, {
        written_at: new Date().toISOString(),
        body: "Written by the assistant tools integration test.",
      });
      expect(written.ok).toBe(true);
      if (!written.ok) return;
      noteId = written.id;

      const trail = await getAuditTrailForAssistant(nurse, { residentId: harold, since: today });
      expect(trail!.source.tab).toBe("audit");
      const event = trail!.events.find((entry) => entry.recordId === noteId);
      expect(event).toMatchObject({
        actor: "Maria Alvarez, RN",
        summary: "wrote a progress note",
        recordType: "Progress note",
        tab: "notes",
        occurredOn: today,
        daysAgo: 0,
      });
      expect(event!.changes.find((change) => change.field === "Note")?.after).toContain(
        "integration test",
      );

      const notesOnly = await getAuditTrailForAssistant(nurse, {
        residentId: harold,
        since: today,
        recordTypes: ["notes"],
      });
      expect(notesOnly!.events.some((entry) => entry.recordId === noteId)).toBe(true);
      const medicationsOnly = await getAuditTrailForAssistant(nurse, {
        residentId: harold,
        since: today,
        recordTypes: ["medications"],
      });
      expect(medicationsOnly!.events.some((entry) => entry.recordId === noteId)).toBe(false);

      const unitA = await getRecentActivity(nurse, { unit: "A", since: today });
      expect(unitA.scope.units).toEqual(["Unit A at Willowbrook Meadows"]);
      expect(unitA.activity.find((entry) => entry.recordId === noteId)).toMatchObject({
        resident: { id: harold, name: "Harold Doe" },
        actor: "Maria Alvarez, RN",
      });
      expect(unitA.sources).toContainEqual({
        residentId: harold,
        residentName: "Harold Doe",
        tab: "audit",
      });

      const unitB = await getRecentActivity(nurse, { unit: "B", since: today });
      expect(unitB.activity.some((entry) => entry.recordId === noteId)).toBe(false);

      const admin = as("admin");
      const meadowsA = await getRecentActivity(admin, {
        unit: "A",
        facility: "MDW",
        since: today,
      });
      expect(meadowsA.scope.units).toEqual(["Unit A at Willowbrook Meadows"]);
      expect(meadowsA.activity.some((entry) => entry.recordId === noteId)).toBe(true);
      const harbor = await getRecentActivity(admin, { facility: "Harbor", since: today });
      expect(harbor.scope.facilities).toEqual(["Willowbrook Harbor"]);
      expect(harbor.activity.some((entry) => entry.recordId === noteId)).toBe(false);

      const harborNurse = await getRecentActivity(as("nurse-harbor"), { since: today });
      expect(harborNurse.activity.some((entry) => entry.recordId === noteId)).toBe(false);
    });
  });
});
