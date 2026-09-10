/**
 * The audit triggers, run against the seeded hosted project: a change through a nurse's
 * session and a change through the service role naming an actor both produce an audit event
 * with the right actor and before-and-after values; a service-role write naming nobody is
 * rejected; the archive flows from ticket 05 are recorded as changes, not deletes; events are
 * readable in the resident's scope and in no other; and nothing but the triggers can write them.
 *
 * Skipped without `.env.local`. Puts the seed back with the service role when it is done, with
 * the same skip flag the seeder uses, so the cleanup leaves no events of its own.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addAllergy,
  archiveRecord,
  cancelAppointment,
  recordVitals,
  scheduleAppointment,
  updateResidentDetails,
  writeProgressNote,
} from "../care/record";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import {
  buildSeed,
  residentsVisibleTo,
  type ClinicalTable,
  type Seed,
  type SeedRow,
} from "../seed";
import { dateInZone } from "../time";

import { getAuditTrail } from "./events";

import type { ResidentDetailsInput } from "../care/schemas";
import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const hostedProject = Boolean(url && key && secretKey && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;

const nurseAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-meadows")!;
const harborAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-harbor")!;
const adminAccount = DEMO_ACCOUNTS.find((account) => account.key === "admin")!;

async function signIn(account: DemoAccount, headers: Record<string, string> = {}): Promise<Client> {
  const client = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`Could not sign in as ${account.email}: ${error.message}`);
  return client;
}

/** A service-role client, with the request headers a service-role caller uses. */
function serviceRole(headers: Record<string, string> = {}): Client {
  return createClient<Database>(url!, secretKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

const now = () => new Date().toISOString();

const VITALS = {
  systolic: 128,
  diastolic: 76,
  pulse: 70,
  temperature_f: 98.2,
  respiratory_rate: 16,
  oxygen_saturation: 97,
  weight_lb: undefined,
  notes: "Recorded by the audit trigger test.",
};

describe.skipIf(!hostedProject)("audit triggers on the hosted project", () => {
  let nurse: Client;
  let harborNurse: Client;
  let admin: Client;
  /** The service role naming nobody, the way a careless caller would. */
  let anonymousService: Client;
  /** The service role acting as a simulated nurse, the way the simulator does. */
  let simulator: Client;
  /** The service role with auditing skipped, the way the seeder (and this cleanup) does. */
  let unaudited: Client;
  let seed: Seed;
  let nurseStaffId: string;
  let simulatedNurseId: string;
  let resident: SeedRow<"residents">;
  let harborResident: SeedRow<"residents">;
  let startedAt: string;

  const inserted: Array<{ table: ClinicalTable; id: string }> = [];
  const track = (table: ClinicalTable, id: string) => {
    inserted.push({ table, id });
    return id;
  };

  const detailsOf = (row: SeedRow<"residents">): ResidentDetailsInput => ({
    first_name: row.first_name,
    last_name: row.last_name,
    date_of_birth: row.date_of_birth,
    sex: row.sex as "female" | "male",
    admission_date: row.admission_date,
    status: row.status,
    stay_ended_on: row.stay_ended_on,
    stay_end_reason: row.stay_end_reason,
    code_status: row.code_status,
    diet: row.diet,
    mobility: row.mobility,
    unit_id: row.unit_id,
    room_id: row.room_id,
  });

  /** The events for one record, oldest first, as the service role sees them. */
  const eventsFor = async (recordId: string) => {
    const { data, error } = await unaudited
      .from("audit_events")
      .select("*")
      .eq("record_id", recordId)
      .order("occurred_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  };

  beforeAll(async () => {
    startedAt = now();
    nurse = await signIn(nurseAccount);
    harborNurse = await signIn(harborAccount);
    admin = await signIn(adminAccount);
    anonymousService = serviceRole();
    unaudited = serviceRole({ "x-caredesk-audit": "skip" });

    const { data: run, error } = await nurse
      .from("seed_runs")
      .select("seed_number, anchor")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    nurseStaffId = seed.staff.find((member) => member.account?.key === nurseAccount.key)!.id;

    resident = residentsVisibleTo(seed, nurseAccount).find(
      (row) => row.status === "current" && row.diet !== "renal",
    )!;
    harborResident = residentsVisibleTo(seed, harborAccount).find(
      (row) => row.status === "current",
    )!;
    // A simulated nurse who covers the resident's unit, as the simulator would choose.
    simulatedNurseId = seed.staff.find(
      (member) => member.is_simulated && member.unit_ids.includes(resident.unit_id),
    )!.id;
    simulator = serviceRole({ "x-caredesk-actor": simulatedNurseId });
  });

  afterAll(async () => {
    for (const { table, id } of inserted.reverse()) {
      const removed = await unaudited.from(table).delete().eq("id", id);
      expect(removed.error, `${table} ${id}`).toBeNull();
    }
    if (resident) {
      await unaudited.from("residents").update(detailsOf(resident)).eq("id", resident.id);
    }
    const residentIds = [resident?.id, harborResident?.id].filter(Boolean) as string[];
    if (residentIds.length > 0) {
      const cleared = await unaudited
        .from("audit_events")
        .delete()
        .in("resident_id", residentIds)
        .gte("occurred_at", startedAt);
      expect(cleared.error).toBeNull();
    }
    await nurse?.auth.signOut();
    await harborNurse?.auth.signOut();
    await admin?.auth.signOut();
  });

  it("a change through a user session is attributed to the signed-in nurse, with the new values", async () => {
    const vitals = await recordVitals(nurse, { staffId: nurseStaffId }, resident.id, {
      ...VITALS,
      taken_at: now(),
    });
    expect(vitals).toMatchObject({ ok: true });
    if (!vitals.ok) return;
    track("vitals", vitals.id);

    const [event] = await eventsFor(vitals.id);
    expect(event).toMatchObject({
      actor_id: nurseStaffId,
      resident_id: resident.id,
      table_name: "vitals",
      record_id: vitals.id,
      operation: "insert",
      old_values: null,
      changed_columns: [],
    });
    expect(event.new_values).toMatchObject({
      id: vitals.id,
      resident_id: resident.id,
      taken_by: nurseStaffId,
      systolic: VITALS.systolic,
      diastolic: VITALS.diastolic,
      notes: VITALS.notes,
      archived_at: null,
    });

    // The page reads the same event as a sentence, attributed by name.
    const trail = await getAuditTrail(nurse, resident.id);
    expect(trail.total).toBeGreaterThanOrEqual(1);
    const entry = trail.entries.find((candidate) => candidate.record_id === vitals.id)!;
    expect(entry.actor).toMatchObject({ first_name: "Maria", last_name: "Alvarez" });
    expect(entry.story).toMatchObject({ summary: "recorded vitals", kind: "added", tab: "vitals" });
    expect(entry.story.changes).toContainEqual({
      column: "taken_by",
      label: "Taken by",
      before: null,
      after: "Maria Alvarez, RN",
    });
  });

  it("an update records only the columns that changed, before and after; a no-op records nothing", async () => {
    const changed = await updateResidentDetails(nurse, resident.id, {
      ...detailsOf(resident),
      diet: "renal",
    });
    expect(changed).toMatchObject({ ok: true });

    const events = await eventsFor(resident.id);
    const event = events[events.length - 1];
    expect(event).toMatchObject({
      actor_id: nurseStaffId,
      table_name: "residents",
      operation: "update",
      changed_columns: ["diet"],
    });
    expect(event.old_values).toMatchObject({ diet: resident.diet });
    expect(event.new_values).toMatchObject({ diet: "renal" });

    const trail = await getAuditTrail(nurse, resident.id);
    expect(trail.entries[0].story.summary).toBe(
      `changed the resident's diet from ${label(resident.diet)} to Renal`,
    );
    expect(trail.entries[0].story.changes).toEqual([
      { column: "diet", label: "Diet", before: label(resident.diet), after: "Renal" },
    ]);

    // Saving the form again with the same values is not a change.
    const same = await updateResidentDetails(nurse, resident.id, {
      ...detailsOf(resident),
      diet: "renal",
    });
    expect(same).toMatchObject({ ok: true });
    expect((await eventsFor(resident.id)).length).toBe(events.length);

    const restored = await updateResidentDetails(nurse, resident.id, detailsOf(resident));
    expect(restored).toMatchObject({ ok: true });
    expect((await eventsFor(resident.id)).length).toBe(events.length + 1);
  });

  it("a change through the service role naming an actor looks the same as a nurse's", async () => {
    const vitals = await recordVitals(simulator, { staffId: simulatedNurseId }, resident.id, {
      ...VITALS,
      taken_at: now(),
      notes: "Recorded through the simulator's path.",
    });
    expect(vitals).toMatchObject({ ok: true });
    if (!vitals.ok) return;
    track("vitals", vitals.id);

    const [event] = await eventsFor(vitals.id);
    expect(event).toMatchObject({
      actor_id: simulatedNurseId,
      table_name: "vitals",
      operation: "insert",
    });

    const simulated = seed.staff.find((member) => member.id === simulatedNurseId)!;
    const trail = await getAuditTrail(nurse, resident.id);
    const entry = trail.entries.find((candidate) => candidate.record_id === vitals.id)!;
    expect(entry.actor).toMatchObject({
      first_name: simulated.first_name,
      last_name: simulated.last_name,
    });
    expect(entry.story.summary).toBe("recorded vitals");
  });

  it("a service-role write naming nobody, or someone who is not staff, is rejected", async () => {
    const note = {
      resident_id: resident.id,
      written_by: nurseStaffId,
      written_at: now(),
      body: "This note must never be written: nobody is named as the actor.",
    };

    const nobody = await anonymousService.from("progress_notes").insert(note).select("id");
    expect(nobody.error?.message).toContain("x-caredesk-actor");
    expect(nobody.error?.hint).toBe("no_actor");

    const stranger = serviceRole({ "x-caredesk-actor": "00000000-0000-4000-8000-000000000000" });
    const unknown = await stranger.from("progress_notes").insert(note).select("id");
    expect(unknown.error?.message).toContain("is not a staff member");

    const garbage = serviceRole({ "x-caredesk-actor": "not-an-id" });
    const invalid = await garbage.from("progress_notes").insert(note).select("id");
    expect(invalid.error?.message).toContain("is not a staff id");

    const landed = await unaudited.from("progress_notes").select("id").eq("body", note.body);
    expect(landed.data).toEqual([]);
  });

  it("the seeder's skip flag silences the trigger for the service role only", async () => {
    const seeded = await writeProgressNote(unaudited, { staffId: nurseStaffId }, resident.id, {
      written_at: now(),
      body: "Written the way the seeder writes: not a change, not audited.",
    });
    expect(seeded).toMatchObject({ ok: true });
    if (!seeded.ok) return;
    track("progress_notes", seeded.id);
    expect(await eventsFor(seeded.id)).toEqual([]);

    // A nurse sending the same header is audited all the same.
    const skipping = await signIn(nurseAccount, { "x-caredesk-audit": "skip" });
    const audited = await writeProgressNote(skipping, { staffId: nurseStaffId }, resident.id, {
      written_at: now(),
      body: "Written by a nurse who asked not to be audited.",
    });
    await skipping.auth.signOut();
    expect(audited).toMatchObject({ ok: true });
    if (!audited.ok) return;
    track("progress_notes", audited.id);
    expect(await eventsFor(audited.id)).toMatchObject([
      { operation: "insert", actor_id: nurseStaffId },
    ]);
  });

  it("the archive and cancel flows are recorded as changes, not deletes", async () => {
    const allergy = await addAllergy(nurse, resident.id, {
      code: "7984",
      allergy_type: "allergy",
      reaction: "Hives",
      severity: "mild",
      noted_on: dateInZone(new Date()),
    });
    expect(allergy).toMatchObject({ ok: true });
    if (!allergy.ok) return;
    track("allergies", allergy.id);

    expect(await archiveRecord(nurse, "allergies", resident.id, allergy.id)).toMatchObject({
      ok: true,
    });

    const [added, removed] = await eventsFor(allergy.id);
    expect(added).toMatchObject({ operation: "insert", actor_id: nurseStaffId });
    expect(removed).toMatchObject({
      operation: "update",
      actor_id: nurseStaffId,
      changed_columns: ["archived_at"],
    });
    expect(removed.old_values).toMatchObject({ archived_at: null, description: "Penicillin V" });
    expect((removed.new_values as { archived_at: string | null }).archived_at).not.toBeNull();

    const trail = await getAuditTrail(nurse, resident.id);
    const story = trail.entries.find(
      (entry) => entry.record_id === allergy.id && entry.operation === "update",
    )!.story;
    expect(story).toMatchObject({ summary: "removed the Penicillin V allergy", kind: "removed" });

    const appointment = await scheduleAppointment(nurse, { staffId: nurseStaffId }, resident.id, {
      kind: "specialist",
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      location: "Audit trigger test clinic",
      purpose: "Follow-up",
    });
    expect(appointment).toMatchObject({ ok: true });
    if (!appointment.ok) return;
    track("appointments", appointment.id);
    expect(await cancelAppointment(nurse, resident.id, appointment.id)).toMatchObject({ ok: true });

    const [, cancelled] = await eventsFor(appointment.id);
    expect(cancelled).toMatchObject({ operation: "update", changed_columns: ["status"] });
    expect(cancelled.old_values).toMatchObject({ status: "scheduled" });
    expect(cancelled.new_values).toMatchObject({ status: "cancelled" });

    // Only the service role can delete a row, and when it does the trail says so.
    const deleted = await simulator.from("allergies").delete().eq("id", allergy.id);
    expect(deleted.error).toBeNull();
    inserted.splice(
      inserted.findIndex((row) => row.id === allergy.id),
      1,
    );
    const events = await eventsFor(allergy.id);
    expect(events.map((event) => event.operation)).toEqual(["insert", "update", "delete"]);
    expect(events[2]).toMatchObject({ actor_id: simulatedNurseId, new_values: null });
    expect(events[2].old_values).toMatchObject({ id: allergy.id, description: "Penicillin V" });
  });

  it("events are readable within the resident's scope and in no other", async () => {
    const adminStaffId = seed.staff.find((member) => member.account?.key === adminAccount.key)!.id;
    const note = await writeProgressNote(admin, { staffId: adminStaffId }, harborResident.id, {
      written_at: now(),
      body: "Written by the admin for a Harbor resident.",
    });
    expect(note).toMatchObject({ ok: true });
    if (!note.ok) return;
    track("progress_notes", note.id);

    const asMeadows = await nurse.from("audit_events").select("id").eq("record_id", note.id);
    expect(asMeadows.error).toBeNull();
    expect(asMeadows.data).toEqual([]);
    expect(await getAuditTrail(nurse, harborResident.id)).toEqual({ entries: [], total: 0 });

    const asHarbor = await harborNurse
      .from("audit_events")
      .select("actor_id")
      .eq("record_id", note.id);
    expect(asHarbor.data).toEqual([{ actor_id: adminStaffId }]);
    const asAdmin = await getAuditTrail(admin, harborResident.id);
    expect(asAdmin.entries[0]).toMatchObject({ record_id: note.id });
    expect(asAdmin.entries[0].actor).toMatchObject({ first_name: "Priya" });
  });

  it("nobody but the triggers can write audit events", async () => {
    const forged = await nurse.from("audit_events").insert({
      actor_id: nurseStaffId,
      resident_id: resident.id,
      table_name: "vitals",
      record_id: resident.id,
      operation: "insert",
      new_values: { forged: true },
    });
    expect(forged.error?.code).toBe("42501");

    const mine = await nurse
      .from("audit_events")
      .select("id")
      .eq("resident_id", resident.id)
      .eq("actor_id", nurseStaffId)
      .limit(1)
      .single();
    expect(mine.data).not.toBeNull();
    const edited = await nurse
      .from("audit_events")
      .update({ actor_id: simulatedNurseId })
      .eq("id", mine.data!.id);
    expect(edited.error?.code).toBe("42501");
    const erased = await nurse.from("audit_events").delete().eq("id", mine.data!.id);
    expect(erased.error?.code).toBe("42501");
    const still = await unaudited
      .from("audit_events")
      .select("actor_id")
      .eq("id", mine.data!.id)
      .single();
    expect(still.data?.actor_id).toBe(nurseStaffId);
  });
});

function label(diet: string): string {
  return diet.charAt(0).toUpperCase() + diet.slice(1).replace(/_/g, " ");
}
