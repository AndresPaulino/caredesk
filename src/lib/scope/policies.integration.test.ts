/**
 * The proof behind the privacy claim (ADR 0003): each demo account signs in with the
 * publishable key and reads through Row Level Security, exactly as the app does. For every
 * table that holds resident data, each account sees exactly the rows whose resident is in
 * their scope, and writes outside that scope are rejected.
 *
 * Runs against the hosted project when `.env.local` is present and the seed has been applied
 * (`pnpm db:seed`). The latest `seed_runs` row says which seed number and anchor were used, so
 * the test rebuilds the same dataset in memory and compares. Skipped when the connection
 * variables are absent, so the unit suite always runs in CI.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ASSESSMENT_KINDS } from "../clinical/assessment-kinds";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import {
  CLINICAL_TABLES,
  buildSeed,
  residentsVisibleTo,
  rowsVisibleTo,
  tableRowCounts,
  type Seed,
} from "../seed";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const hostedProject = Boolean(url && key && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;
type CountableTable = keyof Database["public"]["Tables"] | "resident_directory";

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

async function countRows(client: Client, table: CountableTable) {
  // A head-only count works on any relation; the client's overloads differ only in row type.
  const { count, error } = await client
    .from(table as "residents")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

const account = (key: DemoAccount["key"]) => DEMO_ACCOUNTS.find((a) => a.key === key)!;

describe.skipIf(!hostedProject)("scope policies on the hosted project", () => {
  const clients = new Map<DemoAccount["key"], Client>();
  let seed: Seed;

  beforeAll(async () => {
    for (const demo of DEMO_ACCOUNTS) clients.set(demo.key, await signIn(demo));

    // Rebuild exactly the dataset the last `pnpm db:seed` wrote.
    const { data: run, error } = await clients
      .get("admin")!
      .from("seed_runs")
      .select("seed_number, anchor, row_counts")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    expect(tableRowCounts(seed)).toEqual(run.row_counts);
  });

  afterAll(async () => {
    for (const client of clients.values()) await client.auth.signOut();
  });

  it("the seed is the one the tests expect", async () => {
    const admin = clients.get("admin")!;
    expect(await countRows(admin, "residents")).toBe(seed.residents.length);
    expect(await countRows(admin, "facilities")).toBe(seed.facilities.length);
    expect(await countRows(admin, "units")).toBe(seed.units.length);
    expect(await countRows(admin, "rooms")).toBe(seed.rooms.length);
    expect(await countRows(admin, "staff")).toBe(seed.staff.length);
  });

  it("the assessment kinds in the database match the ones the code knows", async () => {
    const { data } = await clients
      .get("admin")!
      .from("assessment_kinds")
      .select("kind, name, due_every_days, expected_for_everyone")
      .order("sort_order");
    expect(data).toEqual(
      ASSESSMENT_KINDS.map((kind) => ({
        kind: kind.kind,
        name: kind.name,
        due_every_days: kind.dueEveryDays,
        expected_for_everyone: kind.expectedForEveryone,
      })),
    );
  });

  for (const demo of DEMO_ACCOUNTS) {
    it(`${demo.scopeLabel}: sees exactly the residents in scope`, async () => {
      const client = clients.get(demo.key)!;
      const expected = residentsVisibleTo(seed, demo);
      const { data, error } = await client.from("residents").select("id");
      expect(error).toBeNull();
      expect(data!.map((row) => row.id).sort()).toEqual(expected.map((row) => row.id).sort());
      expect(await countRows(client, "resident_directory")).toBe(expected.length);
    });

    it(`${demo.scopeLabel}: sees exactly the clinical rows of residents in scope`, async () => {
      const client = clients.get(demo.key)!;
      const counts = await Promise.all(
        CLINICAL_TABLES.map(async (table) => [table, await countRows(client, table)] as const),
      );
      for (const [table, count] of counts) {
        expect(count, table).toBe(rowsVisibleTo(seed, table, demo).length);
      }
    });
  }

  it("a nurse sees only their own facility and units", async () => {
    const meadows = account("nurse-meadows");
    const nurse = clients.get(meadows.key)!;
    const { data: facilities } = await nurse.from("facilities").select("code");
    expect(facilities!.map((row) => row.code)).toEqual([meadows.facilityCode]);
    const { data: units } = await nurse.from("units").select("code").order("code");
    expect(units!.map((row) => row.code)).toEqual(meadows.unitCodes);
  });

  it("an out-of-scope resident is 'not found' by direct fetch, not blocked", async () => {
    const harborResident = residentsVisibleTo(seed, account("nurse-harbor"))[0];
    const nurse = clients.get("nurse-meadows")!;

    const direct = await nurse
      .from("residents")
      .select("id")
      .eq("id", harborResident.id)
      .maybeSingle();
    expect(direct.error).toBeNull();
    expect(direct.data).toBeNull();

    const viaView = await nurse
      .from("resident_directory")
      .select("id")
      .eq("id", harborResident.id)
      .maybeSingle();
    expect(viaView.error).toBeNull();
    expect(viaView.data).toBeNull();

    const search = await nurse
      .from("resident_directory")
      .select("id")
      .ilike("search_text", `%${harborResident.last_name}%`);
    expect(search.data!.some((row) => row.id === harborResident.id)).toBe(false);

    const vitals = await nurse.from("vitals").select("id").eq("resident_id", harborResident.id);
    expect(vitals.error).toBeNull();
    expect(vitals.data).toEqual([]);
  });

  it("a nurse cannot change a resident outside their scope", async () => {
    const harborResident = residentsVisibleTo(seed, account("nurse-harbor"))[0];
    const nurse = clients.get("nurse-meadows")!;

    const { data, error } = await nurse
      .from("residents")
      .update({ mobility: "bedbound" })
      .eq("id", harborResident.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const check = await clients
      .get("admin")!
      .from("residents")
      .select("mobility")
      .eq("id", harborResident.id)
      .single();
    expect(check.data?.mobility).toBe(harborResident.mobility);
  });

  it("a nurse cannot move a resident to a unit they do not cover", async () => {
    const meadows = account("nurse-meadows");
    const nurse = clients.get(meadows.key)!;
    const mine = residentsVisibleTo(seed, meadows)[0];
    const unitC = seed.units.find(
      (unit) => unit.facility_id === mine.facility_id && unit.code === "C",
    )!;

    const { data, error } = await nurse
      .from("residents")
      .update({ unit_id: unitC.id, room_id: null })
      .eq("id", mine.id)
      .select("id");
    // The with-check clause rejects the new row outright.
    expect(data ?? []).toEqual([]);
    expect(error?.code ?? "42501").toBe("42501");
  });

  it("a nurse cannot record care for a resident outside their scope", async () => {
    const harbor = account("nurse-harbor");
    const harborResident = residentsVisibleTo(seed, harbor)[0];
    const meadowsNurse = clients.get("nurse-meadows")!;
    const meadowsStaffId = seed.staff.find((m) => m.account?.key === "nurse-meadows")!.id;

    const note = await meadowsNurse.from("progress_notes").insert({
      resident_id: harborResident.id,
      written_by: meadowsStaffId,
      written_at: new Date().toISOString(),
      body: "This note must never be written.",
    });
    expect(note.error?.code).toBe("42501");

    const vitals = await meadowsNurse.from("vitals").insert({
      resident_id: harborResident.id,
      taken_by: meadowsStaffId,
      taken_at: new Date().toISOString(),
      systolic: 120,
      diastolic: 80,
      pulse: 72,
      temperature_f: 98.2,
      respiratory_rate: 16,
      oxygen_saturation: 97,
    });
    expect(vitals.error?.code).toBe("42501");

    const condition = rowsVisibleTo(seed, "conditions", harbor)[0];
    const update = await meadowsNurse
      .from("conditions")
      .update({ resolved_on: "2026-01-01" })
      .eq("id", condition.id)
      .select("id");
    expect(update.error).toBeNull();
    expect(update.data).toEqual([]);
  });

  it("a nurse records care in their own name, never a colleague's", async () => {
    const meadows = account("nurse-meadows");
    const nurse = clients.get(meadows.key)!;
    const mine = residentsVisibleTo(seed, meadows).find((row) => row.status === "current")!;
    const colleague = seed.staff.find(
      (member) =>
        member.role === "nurse" && member.facility_id === mine.facility_id && !member.account,
    )!;

    const note = await nurse.from("progress_notes").insert({
      resident_id: mine.id,
      written_by: colleague.id,
      written_at: new Date().toISOString(),
      body: "This note must never be written in a colleague's name.",
    });
    expect(note.error?.code).toBe("42501");

    const vitals = await nurse.from("vitals").insert({
      resident_id: mine.id,
      taken_by: colleague.id,
      taken_at: new Date().toISOString(),
      systolic: 120,
      diastolic: 80,
      pulse: 72,
      temperature_f: 98.2,
      respiratory_rate: 16,
      oxygen_saturation: 97,
    });
    expect(vitals.error?.code).toBe("42501");
  });

  it("nobody but the service role can reset the demo data", async () => {
    const { error } = await clients.get("admin")!.rpc("reset_demo_data");
    expect(error?.code).toBe("42501");
    expect(await countRows(clients.get("admin")!, "residents")).toBe(seed.residents.length);
  });

  it("an anonymous client sees nothing", async () => {
    const anonymous = createClient<Database>(url!, key!, { auth: { persistSession: false } });
    expect(await countRows(anonymous, "residents")).toBe(0);
    expect(await countRows(anonymous, "facilities")).toBe(0);
    expect(await countRows(anonymous, "vitals")).toBe(0);
    expect(await countRows(anonymous, "progress_notes")).toBe(0);
  });
});
