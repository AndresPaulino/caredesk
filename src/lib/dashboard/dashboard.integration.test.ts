/**
 * The dashboard against the seeded hosted project. For the nurse and the admin, every tile's
 * count from `dashboard_tiles_at()` equals the count the TypeScript rules in `rules.ts`
 * produce over the seed for that account's scope, as of the seed's anchor, and the residents
 * behind each focus are the same set. The reference tables the SQL reads agree with their
 * copies in `src/lib/clinical/`. The feed's query excludes events from other facilities, and
 * so does the Realtime subscription behind it.
 *
 * Skipped without `.env.local`. The feed tests write two progress notes through the service
 * role and delete them, and their events, when done.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SCHEDULED_HOURS, WEEKLY_DOSE_DAY } from "../clinical/medication-schedule";
import { SHIFTS, shiftAt } from "../clinical/shifts";
import { VITAL_RANGES, type VitalReading } from "../clinical/vital-ranges";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import { RESIDENT_FOCUSES } from "../residents/focus";
import { buildSeed, residentsVisibleTo, rowsVisibleTo, type Seed, type SeedRow } from "../seed";
import { addDays, dateInZone } from "../time";

import { getActivityEntries, listRecentActivity } from "../audit/events";
import { dashboardFlags, type DashboardFlags, type DashboardRecord } from "./rules";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const hostedProject = Boolean(url && key && secretKey && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;

const meadowsAccount = DEMO_ACCOUNTS.find((account) => account.key === "nurse-meadows")!;
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

function serviceRole(headers: Record<string, string> = {}): Client {
  return createClient<Database>(url!, secretKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

type ExpectedTiles = {
  residents: number;
  beds: number;
  medication_due: number;
  medication_overdue: number;
  overdue_assessment: number;
  out_of_range_vitals: number;
  incidents: number;
  incident_residents: number;
  appointments_today: number;
  appointments_tomorrow: number;
  appointment_residents: number;
};

/** The tiles, computed from the seed with the TypeScript rules, for one account's scope. */
function expectedDashboard(seed: Seed, account: DemoAccount, asOf: Date) {
  const byResident = <T extends { resident_id: string }>(rows: readonly T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.resident_id);
      if (list) list.push(row);
      else map.set(row.resident_id, [row]);
    }
    return map;
  };
  const assessments = byResident(rowsVisibleTo(seed, "assessments", account));
  const vitals = byResident(rowsVisibleTo(seed, "vitals", account));
  const incidents = byResident(rowsVisibleTo(seed, "incidents", account));
  const appointments = byResident(rowsVisibleTo(seed, "appointments", account));
  const orders = byResident(rowsVisibleTo(seed, "medication_orders", account));
  const administrations = byResident(rowsVisibleTo(seed, "administrations", account));

  const current = residentsVisibleTo(seed, account).filter((r) => r.status === "current");
  const flags = new Map<string, DashboardFlags>();
  for (const resident of current) {
    const record: DashboardRecord = {
      assessments: assessments.get(resident.id) ?? [],
      vitals: vitals.get(resident.id) ?? [],
      incidents: incidents.get(resident.id) ?? [],
      appointments: appointments.get(resident.id) ?? [],
      medication_orders: orders.get(resident.id) ?? [],
      administrations: administrations.get(resident.id) ?? [],
    };
    flags.set(resident.id, dashboardFlags(record, asOf));
  }
  const count = (flag: keyof DashboardFlags) =>
    [...flags.values()].filter((value) => value[flag]).length;

  const unitIds = new Set(current.map((resident) => resident.unit_id));
  const scopedUnits =
    account.role === "admin" ? seed.units : seed.units.filter((unit) => unitIds.has(unit.id));
  const scopedUnitIds = new Set(scopedUnits.map((unit) => unit.id));
  const beds = seed.rooms
    .filter((room) => scopedUnitIds.has(room.unit_id))
    .reduce((sum, room) => sum + room.capacity, 0);

  const today = dateInZone(asOf);
  const tomorrow = addDays(today, 1);
  const since = asOf.getTime() - 7 * 24 * 3_600_000;
  const currentIds = new Set(current.map((resident) => resident.id));
  const recentIncidents = rowsVisibleTo(seed, "incidents", account).filter((incident) => {
    const at = Date.parse(incident.occurred_at);
    return currentIds.has(incident.resident_id) && at > since && at <= asOf.getTime();
  });
  const scheduled = rowsVisibleTo(seed, "appointments", account).filter(
    (appointment) => currentIds.has(appointment.resident_id) && appointment.status === "scheduled",
  );
  const onDate = (date: string) =>
    scheduled.filter((appointment) => dateInZone(new Date(appointment.scheduled_at)) === date);

  const tiles: ExpectedTiles = {
    residents: current.length,
    beds,
    medication_due: count("medication_due"),
    medication_overdue: count("medication_overdue"),
    overdue_assessment: count("overdue_assessment"),
    out_of_range_vitals: count("out_of_range_vitals"),
    incidents: recentIncidents.length,
    incident_residents: count("recent_incident"),
    appointments_today: onDate(today).length,
    appointments_tomorrow: onDate(tomorrow).length,
    appointment_residents: count("upcoming_appointment"),
  };
  return { tiles, flags };
}

describe.skipIf(!hostedProject)("the dashboard on the hosted project", () => {
  const clients = new Map<DemoAccount["key"], Client>();
  let seed: Seed;
  let asOf: Date;

  beforeAll(async () => {
    for (const account of DEMO_ACCOUNTS) clients.set(account.key, await signIn(account));
    const { data: run, error } = await clients
      .get("admin")!
      .from("seed_runs")
      .select("seed_number, anchor")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    asOf = seed.anchor;
  });

  afterAll(async () => {
    for (const client of clients.values()) await client.auth.signOut();
  });

  it("keeps the reference tables in step with their copies in code", async () => {
    const admin = clients.get("admin")!;

    const { data: ranges } = await admin.from("vital_ranges").select("*").order("sort_order");
    expect(
      Object.fromEntries(ranges!.map((row) => [row.reading, [Number(row.low), Number(row.high)]])),
    ).toEqual(
      Object.fromEntries(
        (Object.keys(VITAL_RANGES) as VitalReading[]).map((reading) => [
          reading,
          VITAL_RANGES[reading],
        ]),
      ),
    );

    const { data: doseTimes } = await admin
      .from("medication_dose_times")
      .select("*")
      .order("frequency")
      .order("hour");
    const expectedDoseTimes = Object.entries(SCHEDULED_HOURS).flatMap(([frequency, hours]) =>
      hours.map((hour) => ({
        frequency,
        hour,
        weekday: frequency === "weekly" ? WEEKLY_DOSE_DAY : null,
      })),
    );
    expect(doseTimes).toEqual(expect.arrayContaining(expectedDoseTimes));
    expect(doseTimes).toHaveLength(expectedDoseTimes.length);

    const { data: shifts } = await admin.from("shifts").select("*").order("sort_order");
    expect(
      shifts!.map(({ key, name, start_hour, end_hour }) => ({ key, name, start_hour, end_hour })),
    ).toEqual(
      SHIFTS.map(({ key, name, startHour, endHour }) => ({
        key,
        name,
        start_hour: startHour,
        end_hour: endHour,
      })),
    );
  });

  it("agrees with shiftAt about which shift an instant falls in", async () => {
    const admin = clients.get("admin")!;
    for (const instant of [
      asOf,
      new Date("2026-09-10T06:30:00Z"),
      new Date("2026-09-10T02:59:00Z"),
      new Date("2026-11-01T11:59:00Z"),
    ]) {
      const { data, error } = await admin
        .rpc("shift_window", { at: instant.toISOString() })
        .single();
      expect(error, instant.toISOString()).toBeNull();
      const expected = shiftAt(instant);
      expect(data, instant.toISOString()).toEqual({
        key: expected.key,
        name: expected.name,
        starts_at: expected.startsAt.toISOString().replace(".000Z", "+00:00"),
        ends_at: expected.endsAt.toISOString().replace(".000Z", "+00:00"),
      });
    }
  });

  for (const account of [meadowsAccount, adminAccount]) {
    it(`${account.scopeLabel}: every tile counts what the rules say, as of the seed's anchor`, async () => {
      const client = clients.get(account.key)!;
      const expected = expectedDashboard(seed, account, asOf);

      const { data, error } = await client
        .rpc("dashboard_tiles_at", { as_of: asOf.toISOString() })
        .single();
      expect(error).toBeNull();
      const { shift_key, shift_name, shift_starts_at, shift_ends_at, ...counts } = data!;
      expect(counts).toEqual(expected.tiles);
      const shift = shiftAt(asOf);
      expect({ shift_key, shift_name }).toEqual({ shift_key: shift.key, shift_name: shift.name });
      expect(new Date(shift_starts_at).getTime()).toBe(shift.startsAt.getTime());
      expect(new Date(shift_ends_at).getTime()).toBe(shift.endsAt.getTime());

      // The seed is built so a fresh reseed has something on most tiles.
      expect(expected.tiles.overdue_assessment).toBeGreaterThan(0);
      expect(
        expected.tiles.appointments_today + expected.tiles.appointments_tomorrow,
      ).toBeGreaterThan(0);
    });

    it(`${account.scopeLabel}: each focus lists exactly the residents its tile counted`, async () => {
      const client = clients.get(account.key)!;
      const { flags } = expectedDashboard(seed, account, asOf);

      for (const focus of RESIDENT_FOCUSES) {
        const expectedIds = [...flags.entries()]
          .filter(([, value]) => value[focus.flag])
          .map(([id]) => id)
          .sort();
        const { data, error } = await client
          .rpc("resident_dashboard_at", { as_of: asOf.toISOString() })
          .select("id")
          .eq(focus.flag, true)
          .limit(1000);
        expect(error, focus.key).toBeNull();
        expect(data!.map((row) => row.id).sort(), focus.key).toEqual(expectedIds);
      }
    });
  }

  it("scopes the dashboard to the signed-in nurse: a Harbor nurse gets Harbor's numbers", async () => {
    const harbor = clients.get("nurse-harbor")!;
    const expected = expectedDashboard(seed, harborAccount, asOf);
    const { data } = await harbor.rpc("dashboard_tiles_at", { as_of: asOf.toISOString() }).single();
    expect(data!.residents).toBe(expected.tiles.residents);
    expect(data!.beds).toBe(expected.tiles.beds);
    expect(data!.residents).toBeLessThan(seed.residents.length);
  });

  it("reads occupancy per unit in scope, with beds and current residents", async () => {
    const nurse = clients.get("nurse-meadows")!;
    const { data, error } = await nurse.from("unit_occupancy").select("*").order("unit_code");
    expect(error).toBeNull();
    expect(data!.map((row) => row.unit_code)).toEqual(meadowsAccount.unitCodes);
    for (const row of data!) {
      const rooms = seed.rooms.filter((room) => room.unit_id === row.unit_id);
      expect(row.beds).toBe(rooms.reduce((sum, room) => sum + room.capacity, 0));
      expect(row.residents).toBe(
        seed.residents.filter((r) => r.unit_id === row.unit_id && r.status === "current").length,
      );
    }
  });

  describe("the activity feed", () => {
    let unaudited: Client;
    let meadowsResident: SeedRow<"residents">;
    let harborResident: SeedRow<"residents">;
    let meadowsNoteId: string;
    let harborNoteId: string;
    let meadowsEventId: string;
    let harborEventId: string;
    /** What the Meadows nurse's Realtime subscription heard, by event id. */
    const heard: string[] = [];
    let subscribed: Promise<void>;
    let realtimeNurse: Client;

    const actorFor = (resident: SeedRow<"residents">) =>
      seed.staff.find(
        (member) => member.is_simulated && member.unit_ids.includes(resident.unit_id),
      )!.id;

    beforeAll(async () => {
      unaudited = serviceRole({ "x-caredesk-audit": "skip" });
      meadowsResident = residentsVisibleTo(seed, meadowsAccount).find(
        (r) => r.status === "current",
      )!;
      harborResident = residentsVisibleTo(seed, harborAccount).find((r) => r.status === "current")!;

      // Listen as the Meadows nurse before anything is written.
      realtimeNurse = await signIn(meadowsAccount);
      subscribed = new Promise<void>((resolve, reject) => {
        realtimeNurse
          .channel("dashboard-test")
          .on<{ id: string }>(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "audit_events" },
            (payload) => heard.push(payload.new.id),
          )
          .subscribe((status, error) => {
            if (status === "SUBSCRIBED") resolve();
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              reject(error ?? new Error(`Realtime ${status}`));
            }
          });
      });
      await subscribed;
      // The join is acknowledged a moment before the server starts streaming changes to it.
      await new Promise((resolve) => setTimeout(resolve, 2_000));

      const write = async (resident: SeedRow<"residents">, body: string) => {
        const simulator = serviceRole({ "x-caredesk-actor": actorFor(resident) });
        const { data, error } = await simulator
          .from("progress_notes")
          .insert({
            resident_id: resident.id,
            written_by: actorFor(resident),
            written_at: new Date().toISOString(),
            body,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        const { data: event } = await unaudited
          .from("audit_events")
          .select("id")
          .eq("record_id", data.id)
          .single();
        return { noteId: data.id, eventId: event!.id };
      };
      const harbor = await write(harborResident, "Dashboard feed test: Harbor.");
      const meadows = await write(meadowsResident, "Dashboard feed test: Meadows.");
      harborNoteId = harbor.noteId;
      harborEventId = harbor.eventId;
      meadowsNoteId = meadows.noteId;
      meadowsEventId = meadows.eventId;
    });

    afterAll(async () => {
      await realtimeNurse?.removeAllChannels();
      await realtimeNurse?.auth.signOut();
      if (unaudited) {
        await unaudited.from("audit_events").delete().in("id", [meadowsEventId, harborEventId]);
        await unaudited.from("progress_notes").delete().in("id", [meadowsNoteId, harborNoteId]);
      }
    });

    it("lists the nurse's own facility's events and never another facility's", async () => {
      const nurse = clients.get("nurse-meadows")!;
      const recent = await listRecentActivity(nurse);
      const ids = recent.map((entry) => entry.id);
      expect(ids).toContain(meadowsEventId);
      expect(ids).not.toContain(harborEventId);
      const mine = recent.find((entry) => entry.id === meadowsEventId)!;
      expect(mine.story.summary).toBe("wrote a progress note");
      expect(mine.resident).toEqual({
        id: meadowsResident.id,
        first_name: meadowsResident.first_name,
        last_name: meadowsResident.last_name,
      });
      expect(mine.actor?.id).toBe(actorFor(meadowsResident));

      // Asking for the other facility's event by id yields nothing, the same as no event.
      expect(await getActivityEntries(nurse, [harborEventId])).toEqual([]);

      const admin = clients.get("admin")!;
      const everyone = (await listRecentActivity(admin)).map((entry) => entry.id);
      expect(everyone).toContain(meadowsEventId);
      expect(everyone).toContain(harborEventId);
    });

    it("announces the nurse's own facility's events over Realtime and not another facility's", async () => {
      const deadline = Date.now() + 8_000;
      while (!heard.includes(meadowsEventId) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(heard).toContain(meadowsEventId);
      // The Harbor event was written first; had it been announced it would be here by now.
      expect(heard).not.toContain(harborEventId);
    });
  });
});
