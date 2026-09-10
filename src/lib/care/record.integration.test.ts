/**
 * Recording care, run as the Meadows nurse against the seeded hosted project: every write
 * flow lands for a resident in scope, is attributed to the nurse, and shows in the record the
 * page reads; removals archive rather than delete; room moves respect occupancy; and the same
 * writes are rejected for a resident outside scope while the admin can make them anywhere.
 *
 * Skipped without `.env.local`. Needs the secret key to put the seed back as it found it,
 * since nothing but the service role may delete a row.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { findAllergyConflicts } from "../clinical/allergy-conflicts";
import { buildTimeline } from "../clinical/timeline";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import { getClinicalRecord } from "../residents/clinical-record";
import { getResident } from "../residents/queries";
import {
  buildSeed,
  residentsVisibleTo,
  type ClinicalTable,
  type Seed,
  type SeedRow,
} from "../seed";
import { dateInZone } from "../time";

import {
  addAllergy,
  addFamilyContact,
  addMedicationOrder,
  archiveRecord,
  cancelAppointment,
  discontinueMedicationOrder,
  recordAdministration,
  recordVitals,
  reportIncident,
  scheduleAppointment,
  updateFamilyContact,
  updateResidentDetails,
  writeProgressNote,
} from "./record";
import { MEDICATION_OPTIONS } from "./vocabulary";

import type { ResidentDetailsInput } from "./schemas";
import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const hostedProject = Boolean(url && key && secretKey && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;

const nurseAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-meadows")!;
const harborAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-harbor")!;
const adminAccount = DEMO_ACCOUNTS.find((account) => account.key === "admin")!;

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

const now = () => new Date().toISOString();

const VITALS = {
  systolic: 132,
  diastolic: 78,
  pulse: 74,
  temperature_f: 98.4,
  respiratory_rate: 16,
  oxygen_saturation: 96,
  weight_lb: undefined,
  notes: "Recorded by the integration test.",
};

describe.skipIf(!hostedProject)("recording care on the hosted project", () => {
  let nurse: Client;
  let admin: Client;
  let serviceRole: Client;
  let seed: Seed;
  let nurseStaffId: string;
  let resident: SeedRow<"residents">;
  let harborResident: SeedRow<"residents">;

  /** Rows this file inserted, removed with the service role when it is done. */
  const inserted: Array<{ table: ClinicalTable; id: string }> = [];
  const track = (table: ClinicalTable, id: string) => {
    inserted.push({ table, id });
    return id;
  };

  const seedRows = <T extends ClinicalTable>(table: T, residentId: string): Seed[T] =>
    (seed[table] as Array<{ resident_id: string }>).filter(
      (row) => row.resident_id === residentId,
    ) as Seed[T];

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

  beforeAll(async () => {
    nurse = await signIn(nurseAccount);
    admin = await signIn(adminAccount);
    serviceRole = createClient<Database>(url!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: run, error } = await nurse
      .from("seed_runs")
      .select("seed_number, anchor")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    nurseStaffId = seed.staff.find((member) => member.account?.key === nurseAccount.key)!.id;

    // A current resident in scope with an active order, so administrations can be recorded.
    resident = residentsVisibleTo(seed, nurseAccount).find(
      (row) =>
        row.status === "current" &&
        row.room_id !== null &&
        seedRows("medication_orders", row.id).some((order) => order.status === "active"),
    )!;
    harborResident = residentsVisibleTo(seed, harborAccount).find(
      (row) => row.status === "current",
    )!;
  });

  afterAll(async () => {
    // Put the seed back: remove what was inserted, restore what was changed.
    for (const { table, id } of inserted.reverse()) {
      const removed = await serviceRole.from(table).delete().eq("id", id);
      expect(removed.error, `${table} ${id}`).toBeNull();
    }
    if (resident) {
      await serviceRole.from("residents").update(detailsOf(resident)).eq("id", resident.id);
      for (const contact of seedRows("family_contacts", resident.id)) {
        await serviceRole
          .from("family_contacts")
          .update({ is_primary: contact.is_primary })
          .eq("id", contact.id);
      }
    }
    await nurse?.auth.signOut();
    await admin?.auth.signOut();
  });

  it("records vitals, a note, and an incident in the nurse's name, on the page at once", async () => {
    const vitals = await recordVitals(nurse, { staffId: nurseStaffId }, resident.id, {
      ...VITALS,
      taken_at: now(),
    });
    expect(vitals).toMatchObject({ ok: true });
    if (vitals.ok) track("vitals", vitals.id);

    const note = await writeProgressNote(nurse, { staffId: nurseStaffId }, resident.id, {
      written_at: now(),
      body: "Integration test note: resident resting comfortably.",
    });
    expect(note).toMatchObject({ ok: true });
    if (note.ok) track("progress_notes", note.id);

    const incident = await reportIncident(nurse, { staffId: nurseStaffId }, resident.id, {
      kind: "fall",
      occurred_at: now(),
      description: "Integration test incident: found seated on the floor, no injury.",
      injury_sustained: false,
    });
    expect(incident).toMatchObject({ ok: true });
    if (incident.ok) track("incidents", incident.id);

    const record = await getClinicalRecord(nurse, resident.id);
    expect(record.vitals[0]).toMatchObject({ ...VITALS, weight_lb: null });
    expect(record.vitals[0].staff?.id).toBe(nurseStaffId);
    expect(record.progress_notes[0].staff?.id).toBe(nurseStaffId);
    expect(record.incidents[0]).toMatchObject({ kind: "fall", injury_sustained: false });

    // Both land at the top of the clinical timeline, which keys entries by type and row.
    const timeline = buildTimeline(record);
    const ids = new Set([`note:${note.ok && note.id}`, `incident:${incident.ok && incident.id}`]);
    expect(timeline.slice(0, 2).every((entry) => ids.has(entry.id))).toBe(true);
  });

  it("adds an order from the formulary, records doses against it, then discontinues it", async () => {
    const physician = seed.staff.find(
      (member) => member.role === "physician" && member.facility_id === resident.facility_id,
    )!;
    const allergens = seedRows("allergies", resident.id).flatMap((row) =>
      row.substance ? [row.substance] : [],
    );
    const medication = MEDICATION_OPTIONS.find(
      (option) => !allergens.some((substance) => option.name.toLowerCase().includes(substance)),
    )!;

    const rejected = await addMedicationOrder(nurse, resident.id, {
      medication: "Unicorn dust 5 MG Oral Tablet",
      frequency: "once_daily",
      prescribed_by: physician.id,
      started_on: dateInZone(new Date()),
    });
    expect(rejected).toMatchObject({ ok: false, error: { kind: "invalid", field: "medication" } });

    const wrongPrescriber = await addMedicationOrder(nurse, resident.id, {
      medication: medication.name,
      frequency: "once_daily",
      prescribed_by: nurseStaffId,
      started_on: dateInZone(new Date()),
    });
    expect(wrongPrescriber).toMatchObject({
      ok: false,
      error: { kind: "invalid", field: "prescribed_by" },
    });

    const order = await addMedicationOrder(nurse, resident.id, {
      medication: medication.name.toUpperCase(),
      frequency: medication.defaultFrequency,
      instructions: "Integration test order.",
      prescribed_by: physician.id,
      started_on: dateInZone(new Date()),
    });
    expect(order).toMatchObject({ ok: true });
    if (!order.ok) return;
    track("medication_orders", order.id);

    for (const status of ["given", "refused", "held"] as const) {
      const dose = await recordAdministration(nurse, { staffId: nurseStaffId }, resident.id, {
        medication_order_id: order.id,
        status,
        notes: status === "held" ? "Held per physician." : undefined,
      });
      expect(dose, status).toMatchObject({ ok: true });
      if (dose.ok) track("administrations", dose.id);
    }

    let record = await getClinicalRecord(nurse, resident.id);
    const added = record.medication_orders.find((row) => row.id === order.id)!;
    expect(added).toMatchObject({
      code: medication.code,
      medication: medication.name,
      status: "active",
      prescribed_by: physician.id,
    });
    const doses = record.administrations.filter((row) => row.medication_order_id === order.id);
    expect(doses.map((row) => row.status).sort()).toEqual(["given", "held", "refused"]);
    expect(doses.every((row) => row.staff?.id === nurseStaffId)).toBe(true);

    const discontinued = await discontinueMedicationOrder(nurse, resident.id, order.id);
    expect(discontinued).toMatchObject({ ok: true });
    expect(await discontinueMedicationOrder(nurse, resident.id, order.id)).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
    expect(
      await recordAdministration(nurse, { staffId: nurseStaffId }, resident.id, {
        medication_order_id: order.id,
        status: "given",
      }),
    ).toMatchObject({ ok: false, error: { kind: "invalid", field: "medication_order_id" } });

    record = await getClinicalRecord(nurse, resident.id);
    expect(record.medication_orders.find((row) => row.id === order.id)).toMatchObject({
      status: "discontinued",
      ended_on: dateInZone(new Date()),
    });
  });

  it("adds an allergy that flags a conflicting order, and removing it clears the flag", async () => {
    const physician = seed.staff.find(
      (member) => member.role === "physician" && member.facility_id === resident.facility_id,
    )!;
    const penicillin = MEDICATION_OPTIONS.find((option) =>
      option.name.toLowerCase().includes("penicillin"),
    )!;
    const order = await addMedicationOrder(nurse, resident.id, {
      medication: penicillin.name,
      frequency: penicillin.defaultFrequency,
      prescribed_by: physician.id,
      started_on: dateInZone(new Date()),
    });
    expect(order).toMatchObject({ ok: true });
    if (!order.ok) return;
    track("medication_orders", order.id);

    const allergy = await addAllergy(nurse, resident.id, {
      code: "7984",
      allergy_type: "allergy",
      reaction: "Hives",
      severity: "moderate",
      noted_on: dateInZone(new Date()),
    });
    expect(allergy).toMatchObject({ ok: true });
    if (!allergy.ok) return;
    track("allergies", allergy.id);

    let record = await getClinicalRecord(nurse, resident.id);
    expect(record.allergies.find((row) => row.id === allergy.id)).toMatchObject({
      description: "Penicillin V",
      category: "medication",
      substance: "penicillin",
      reaction: "Hives",
      severity: "moderate",
    });
    expect(findAllergyConflicts(record.allergies, record.medication_orders)).toContainEqual(
      expect.objectContaining({ allergyId: allergy.id, orderId: order.id }),
    );

    expect(await archiveRecord(nurse, "allergies", resident.id, allergy.id)).toMatchObject({
      ok: true,
    });
    record = await getClinicalRecord(nurse, resident.id);
    expect(record.allergies.some((row) => row.id === allergy.id)).toBe(false);
    expect(findAllergyConflicts(record.allergies, record.medication_orders)).toEqual([]);

    const kept = await serviceRole
      .from("allergies")
      .select("archived_at")
      .eq("id", allergy.id)
      .single();
    expect(kept.data?.archived_at).not.toBeNull();
  });

  it("schedules, cancels, and removes an appointment; the removed row is archived, not deleted", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const appointment = await scheduleAppointment(nurse, { staffId: nurseStaffId }, resident.id, {
      kind: "specialist",
      scheduled_at: tomorrow,
      location: "Integration test clinic",
      purpose: "Follow-up",
    });
    expect(appointment).toMatchObject({ ok: true });
    if (!appointment.ok) return;
    track("appointments", appointment.id);

    let record = await getClinicalRecord(nurse, resident.id);
    expect(record.appointments.find((row) => row.id === appointment.id)).toMatchObject({
      status: "scheduled",
      scheduled_by: nurseStaffId,
    });

    expect(await cancelAppointment(nurse, resident.id, appointment.id)).toMatchObject({ ok: true });
    expect(await cancelAppointment(nurse, resident.id, appointment.id)).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
    record = await getClinicalRecord(nurse, resident.id);
    expect(record.appointments.find((row) => row.id === appointment.id)?.status).toBe("cancelled");

    expect(await archiveRecord(nurse, "appointments", resident.id, appointment.id)).toMatchObject({
      ok: true,
    });
    expect(await archiveRecord(nurse, "appointments", resident.id, appointment.id)).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
    record = await getClinicalRecord(nurse, resident.id);
    expect(record.appointments.some((row) => row.id === appointment.id)).toBe(false);

    const kept = await serviceRole
      .from("appointments")
      .select("id, status, archived_at")
      .eq("id", appointment.id)
      .single();
    expect(kept.data).toMatchObject({ id: appointment.id, status: "cancelled" });
    expect(kept.data?.archived_at).not.toBeNull();
  });

  it("adds, edits, and removes a family contact, keeping one primary contact", async () => {
    const contact = await addFamilyContact(nurse, resident.id, {
      first_name: "Test",
      last_name: "Contact",
      relationship: "niece_or_nephew",
      phone: "(617) 555-0142",
      email: undefined,
      is_primary: true,
      notes: undefined,
    });
    expect(contact).toMatchObject({ ok: true });
    if (!contact.ok) return;
    track("family_contacts", contact.id);

    let record = await getClinicalRecord(nurse, resident.id);
    expect(record.family_contacts.filter((row) => row.is_primary).map((row) => row.id)).toEqual([
      contact.id,
    ]);

    const edited = await updateFamilyContact(nurse, resident.id, contact.id, {
      first_name: "Test",
      last_name: "Contact",
      relationship: "friend",
      phone: "617-555-0199",
      email: "test.contact@example.com",
      is_primary: false,
      notes: "Evenings only.",
    });
    expect(edited).toMatchObject({ ok: true });
    record = await getClinicalRecord(nurse, resident.id);
    expect(record.family_contacts.find((row) => row.id === contact.id)).toMatchObject({
      relationship: "friend",
      phone: "617-555-0199",
      email: "test.contact@example.com",
      is_primary: false,
      notes: "Evenings only.",
    });

    expect(await archiveRecord(nurse, "family_contacts", resident.id, contact.id)).toMatchObject({
      ok: true,
    });
    record = await getClinicalRecord(nurse, resident.id);
    expect(record.family_contacts.some((row) => row.id === contact.id)).toBe(false);
  });

  it("edits resident details and keeps room occupancy consistent", async () => {
    const occupants = new Map<string, number>();
    for (const row of seed.residents) {
      if (row.status === "current" && row.room_id) {
        occupants.set(row.room_id, (occupants.get(row.room_id) ?? 0) + 1);
      }
    }
    const roomsOnUnit = seed.rooms.filter(
      (room) => room.unit_id === resident.unit_id && room.id !== resident.room_id,
    );
    const fullRoom = roomsOnUnit.find((room) => (occupants.get(room.id) ?? 0) >= room.capacity)!;
    const freeRoom = roomsOnUnit.find((room) => (occupants.get(room.id) ?? 0) < room.capacity)!;
    expect(fullRoom, "a full room on the unit").toBeDefined();
    expect(freeRoom, "a room with a free bed on the unit").toBeDefined();

    const overfilled = await updateResidentDetails(nurse, resident.id, {
      ...detailsOf(resident),
      room_id: fullRoom.id,
    });
    expect(overfilled).toMatchObject({
      ok: false,
      error: {
        kind: "invalid",
        field: "room_id",
        message: `Room ${fullRoom.number} has no free bed.`,
      },
    });

    const moved = await updateResidentDetails(nurse, resident.id, {
      ...detailsOf(resident),
      room_id: freeRoom.id,
      diet: "diabetic",
      mobility: "wheelchair",
    });
    expect(moved).toMatchObject({ ok: true });
    expect(await getResident(nurse, resident.id)).toMatchObject({
      room_id: freeRoom.id,
      room_number: freeRoom.number,
      diet: "diabetic",
      mobility: "wheelchair",
    });

    // Ending the stay frees the bed; the schema clears the room before the write.
    const today = dateInZone(new Date());
    const discharged = await updateResidentDetails(nurse, resident.id, {
      ...detailsOf(resident),
      status: "former",
      stay_ended_on: today,
      stay_end_reason: "discharged",
      room_id: null,
    });
    expect(discharged).toMatchObject({ ok: true });
    expect(await getResident(nurse, resident.id)).toMatchObject({
      status: "former",
      stay_ended_on: today,
      stay_end_reason: "discharged",
      room_id: null,
    });

    // The database holds the rule too: a former resident cannot keep a room.
    const keptRoom = await admin
      .from("residents")
      .update({ room_id: freeRoom.id })
      .eq("id", resident.id)
      .select("id");
    expect(keptRoom.error?.code).toBe("23514");

    const readmitted = await updateResidentDetails(nurse, resident.id, detailsOf(resident));
    expect(readmitted).toMatchObject({ ok: true });
    expect(await getResident(nurse, resident.id)).toMatchObject({
      status: "current",
      room_id: resident.room_id,
      diet: resident.diet,
    });
  });

  it("rejects every write for a resident outside the nurse's scope, and allows the admin", async () => {
    const actor = { staffId: nurseStaffId };
    const activeOrder = seedRows("medication_orders", harborResident.id).find(
      (order) => order.status === "active",
    )!;
    const appointment = seedRows("appointments", harborResident.id)[0]!;

    const vitals = await recordVitals(nurse, actor, harborResident.id, {
      ...VITALS,
      taken_at: now(),
    });
    expect(vitals).toMatchObject({ ok: false, error: { kind: "forbidden" } });

    expect(
      await recordAdministration(nurse, actor, harborResident.id, {
        medication_order_id: activeOrder.id,
        status: "given",
      }),
    ).toMatchObject({ ok: false });
    expect(await cancelAppointment(nurse, harborResident.id, appointment.id)).toMatchObject({
      ok: false,
      error: { kind: "not_found" },
    });
    expect(
      await archiveRecord(nurse, "appointments", harborResident.id, appointment.id),
    ).toMatchObject({ ok: false, error: { kind: "not_found" } });
    expect(
      await updateResidentDetails(nurse, harborResident.id, {
        ...detailsOf(harborResident),
        mobility: "bedbound",
      }),
    ).toMatchObject({ ok: false, error: { kind: "not_found" } });

    const untouched = await serviceRole
      .from("residents")
      .select("mobility")
      .eq("id", harborResident.id)
      .single();
    expect(untouched.data?.mobility).toBe(harborResident.mobility);
    const noVitals = await serviceRole
      .from("vitals")
      .select("id")
      .eq("resident_id", harborResident.id)
      .eq("notes", VITALS.notes);
    expect(noVitals.data).toEqual([]);

    const adminStaffId = seed.staff.find((member) => member.account?.key === adminAccount.key)!.id;
    const note = await writeProgressNote(admin, { staffId: adminStaffId }, harborResident.id, {
      written_at: now(),
      body: "Integration test note written by the admin.",
    });
    expect(note).toMatchObject({ ok: true });
    if (note.ok) track("progress_notes", note.id);
  });
});
