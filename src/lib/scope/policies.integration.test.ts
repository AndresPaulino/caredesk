/**
 * The proof behind the privacy claim (ADR 0003): each demo account signs in with the
 * publishable key and reads through Row Level Security, exactly as the app does.
 *
 * Runs against the hosted project when `.env.local` is present and the provisional seed has
 * been applied (`pnpm db:seed`). Skipped when the connection variables are absent, so the
 * unit suite always runs in CI.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  buildProvisionalSeed,
  residentsVisibleTo,
  type ProvisionalSeed,
} from "../../../scripts/seed/provisional-data";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";

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

async function countRows(client: Client, table: "residents" | "facilities" | "units" | "rooms") {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

describe.skipIf(!hostedProject)("scope policies on the hosted project", () => {
  const seed: ProvisionalSeed = buildProvisionalSeed();
  const clients = new Map<DemoAccount["key"], Client>();

  beforeAll(async () => {
    for (const account of DEMO_ACCOUNTS) clients.set(account.key, await signIn(account));
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
  });

  for (const account of DEMO_ACCOUNTS) {
    it(`${account.scopeLabel}: sees exactly the residents in scope`, async () => {
      const client = clients.get(account.key)!;
      const expected = residentsVisibleTo(seed, account);
      const { data, error } = await client.from("residents").select("id, unit_id");
      expect(error).toBeNull();
      expect(data!.map((row) => row.id).sort()).toEqual(expected.map((row) => row.id).sort());
    });

    it(`${account.scopeLabel}: sees the same residents through the directory view`, async () => {
      const client = clients.get(account.key)!;
      const expected = residentsVisibleTo(seed, account);
      const { count } = await client
        .from("resident_directory")
        .select("id", { count: "exact", head: true });
      expect(count).toBe(expected.length);
    });
  }

  it("a nurse sees only their own facility and units", async () => {
    const account = DEMO_ACCOUNTS.find((candidate) => candidate.key === "nurse-meadows")!;
    const nurse = clients.get(account.key)!;
    const { data: facilities } = await nurse.from("facilities").select("code");
    expect(facilities!.map((row) => row.code)).toEqual([account.facilityCode]);
    const { data: units } = await nurse.from("units").select("code").order("code");
    expect(units!.map((row) => row.code)).toEqual(account.unitCodes);
  });

  it("an out-of-scope resident is 'not found' by direct fetch, not blocked", async () => {
    const meadows = DEMO_ACCOUNTS.find((candidate) => candidate.key === "nurse-meadows")!;
    const harbor = DEMO_ACCOUNTS.find((candidate) => candidate.key === "nurse-harbor")!;
    const harborResident = residentsVisibleTo(seed, harbor)[0]!;
    const nurse = clients.get(meadows.key)!;

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
  });

  it("a nurse cannot change a resident outside their scope", async () => {
    const meadows = DEMO_ACCOUNTS.find((candidate) => candidate.key === "nurse-meadows")!;
    const harbor = DEMO_ACCOUNTS.find((candidate) => candidate.key === "nurse-harbor")!;
    const harborResident = residentsVisibleTo(seed, harbor)[0]!;
    const nurse = clients.get(meadows.key)!;

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
    const meadows = DEMO_ACCOUNTS.find((candidate) => candidate.key === "nurse-meadows")!;
    const nurse = clients.get(meadows.key)!;
    const mine = residentsVisibleTo(seed, meadows)[0]!;
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

  it("an anonymous client sees nothing", async () => {
    const anonymous = createClient<Database>(url!, key!, { auth: { persistSession: false } });
    expect(await countRows(anonymous, "residents")).toBe(0);
    expect(await countRows(anonymous, "facilities")).toBe(0);
  });
});
