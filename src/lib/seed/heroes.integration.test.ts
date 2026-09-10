/**
 * The hero residents after a reseed, read from the hosted project the way the app reads them:
 * every hero is in the directory with their authored name, facility, unit, room, and status,
 * and the two Does split between the nurses while the admin sees both.
 *
 * Skipped without `.env.local`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import { getResident } from "../residents/queries";

import { HERO_RESIDENTS, heroResidentId } from "./heroes";

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

describe.skipIf(!hostedProject)("the hero residents on the hosted project", () => {
  const clients = new Map<DemoAccount["key"], Client>();

  beforeAll(async () => {
    for (const demo of DEMO_ACCOUNTS) clients.set(demo.key, await signIn(demo));
  });

  afterAll(async () => {
    for (const client of clients.values()) await client.auth.signOut();
  });

  it("are all in the directory with their authored facts, as the admin sees it", async () => {
    const admin = clients.get("admin")!;
    for (const hero of HERO_RESIDENTS) {
      const resident = await getResident(admin, heroResidentId(hero.key));
      expect(resident, hero.key).toMatchObject({
        first_name: hero.firstName,
        last_name: hero.lastName,
        facility_code: hero.facilityCode,
        unit_code: hero.unitCode,
        room_number: hero.roomNumber,
        status: hero.stay ? "former" : "current",
        diet: hero.diet,
        mobility: hero.mobility,
        code_status: hero.codeStatus,
      });
    }
  });

  it("split the two Does between the nurses", async () => {
    const meadows = clients.get("nurse-meadows")!;
    const harbor = clients.get("nurse-harbor")!;
    const harold = heroResidentId("doe-meadows");
    const walter = heroResidentId("doe-harbor");
    expect(await getResident(meadows, harold)).toMatchObject({ last_name: "Doe" });
    expect(await getResident(meadows, walter)).toBeNull();
    expect(await getResident(harbor, walter)).toMatchObject({ last_name: "Doe" });
    expect(await getResident(harbor, harold)).toBeNull();

    const { data } = await meadows.from("resident_directory").select("id").eq("last_name", "Doe");
    expect(data?.map((row) => row.id)).toEqual([harold]);
    const { data: both } = await clients
      .get("admin")!
      .from("resident_directory")
      .select("id")
      .eq("last_name", "Doe");
    expect(both?.map((row) => row.id).sort()).toEqual([harold, walter].sort());
  });
});
