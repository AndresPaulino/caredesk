/**
 * The proof behind the privacy claim (ADR 0003): each demo account signs in with the
 * publishable key and reads through Row Level Security, exactly as the app does. Every table
 * that holds resident data is listed here, and the list is checked against the live schema,
 * so a table cannot appear without a decision about its scope. For each of them, every
 * account sees exactly the rows whose resident is in their scope, a nurse's write outside
 * that scope is rejected, and an anonymous client sees nothing.
 *
 * Runs against the hosted project when `.env.local` is present; the test setup puts the seed
 * in place first. The latest `seed_runs` row says which seed number and anchor were used, so
 * the test rebuilds the same dataset in memory and compares.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";

import { describeHosted } from "../../test/hosted-project";
import { ASSESSMENT_KINDS } from "../clinical/assessment-kinds";
import { DEMO_ACCOUNTS, type DemoAccount } from "../demo-accounts";
import {
  CLINICAL_TABLES,
  buildSeed,
  residentsVisibleTo,
  rowsVisibleTo,
  scopedResidentIds,
  tableRowCounts,
  type Seed,
  type SeedRow,
} from "../seed";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

type Client = SupabaseClient<Database>;
type TableName = keyof Database["public"]["Tables"];
type ViewName = keyof Database["public"]["Views"];

/**
 * Every table whose rows belong to a resident. A row is visible exactly when its resident is
 * in scope, with two refinements: an audit event about nobody in particular (an assistant
 * lookup) is the actor's and the admin's, and a message is its thread owner's.
 */
const RESIDENT_DATA_TABLES = [
  "residents",
  ...CLINICAL_TABLES,
  "audit_events",
  "assistant_messages",
] as const satisfies readonly TableName[];
type ResidentDataTable = (typeof RESIDENT_DATA_TABLES)[number];

/** Everything else the API exposes: the organization, reference tables, seed runs, the owner-only threads, and the two views. */
const OTHER_RELATIONS = [
  "facilities",
  "units",
  "rooms",
  "staff",
  "staff_unit_assignments",
  "assessment_kinds",
  "vital_ranges",
  "medication_dose_times",
  "shifts",
  "seed_runs",
  "assistant_threads",
  "resident_directory",
  "unit_occupancy",
] as const satisfies readonly (TableName | ViewName)[];

// A table or view in the types that neither list names fails to compile here; the live
// schema is compared with the two lists below.
type Unclassified = Exclude<
  TableName | ViewName,
  ResidentDataTable | (typeof OTHER_RELATIONS)[number]
>;
const everyRelationClassified: [Unclassified] extends [never]
  ? true
  : { unclassified: Unclassified } = true;

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

async function countRows(client: Client, table: TableName | ViewName) {
  // A head-only count works on any relation; the client's overloads differ only in row type.
  const { count, error } = await client
    .from(table as "residents")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

/** The tables and views PostgREST exposes, from its schema description (secret key only). */
async function exposedRelations(): Promise<string[]> {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: secretKey!, Authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) throw new Error(`Could not read the API schema: HTTP ${response.status}`);
  const spec = (await response.json()) as { definitions?: Record<string, unknown> };
  return Object.keys(spec.definitions ?? {}).sort();
}

const account = (key: DemoAccount["key"]) => DEMO_ACCOUNTS.find((a) => a.key === key)!;

describeHosted("scope policies on the hosted project", { secretKey: true }, () => {
  const clients = new Map<DemoAccount["key"], Client>();
  let service: Client;
  let seed: Seed;
  /** What the two tables the seed leaves empty hold right now, for the scope oracle. */
  let events: Array<{ resident_id: string | null; actor_id: string }>;
  let messages: Array<{ thread_id: string }>;
  let threadOwners: Map<string, string>;

  const staffIdOf = (demo: DemoAccount) =>
    seed.staff.find((member) => member.account?.key === demo.key)!.id;

  /** How many rows of a resident-data table an account may see, by the scope rule. */
  function expectedCount(table: ResidentDataTable, demo: DemoAccount): number {
    const inScope = scopedResidentIds(seed, demo);
    switch (table) {
      case "residents":
        return inScope.size;
      case "audit_events":
        return events.filter((event) =>
          event.resident_id
            ? inScope.has(event.resident_id)
            : demo.role === "admin" || event.actor_id === staffIdOf(demo),
        ).length;
      case "assistant_messages":
        return messages.filter((message) => threadOwners.get(message.thread_id) === staffIdOf(demo))
          .length;
      default:
        return rowsVisibleTo(seed, table, demo).length;
    }
  }

  /**
   * A row for a resident outside the Meadows nurse's scope, valid in every other respect:
   * one of the Harbor nurse's seeded rows under a new id, or a hand-made row for the two
   * tables the seed leaves empty.
   */
  function outOfScopeRow(table: ResidentDataTable, resident: SeedRow<"residents">) {
    const id = crypto.randomUUID();
    switch (table) {
      case "residents":
        return { ...resident, id, room_id: null };
      case "audit_events":
        return {
          id,
          actor_id: staffIdOf(account("nurse-meadows")),
          resident_id: resident.id,
          table_name: "progress_notes",
          record_id: crypto.randomUUID(),
          operation: "insert",
          new_values: {},
        };
      case "assistant_messages":
        return {
          id,
          thread_id: crypto.randomUUID(),
          position: 0,
          role: "user",
          content: "This must never be written.",
          resident_id: resident.id,
        };
      default:
        return { ...rowsVisibleTo(seed, table, account("nurse-harbor"))[0], id };
    }
  }

  beforeAll(async () => {
    for (const demo of DEMO_ACCOUNTS) clients.set(demo.key, await signIn(demo));
    service = createClient<Database>(url!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Rebuild exactly the dataset the last `pnpm db:seed` wrote.
    const { data: run, error } = await service
      .from("seed_runs")
      .select("seed_number, anchor, row_counts")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !run) throw new Error("No seed run recorded; run `pnpm db:seed` first.");
    seed = buildSeed({ seed: run.seed_number, anchor: new Date(run.anchor) });
    expect(tableRowCounts(seed)).toEqual(run.row_counts);

    // The seed writes no events, threads, or messages; the test setup reseeds when any are
    // left over, so these snapshots are normally empty. They are taken anyway so the scope
    // oracle is honest about whatever is there.
    const [eventRows, messageRows, threadRows] = await Promise.all([
      service.from("audit_events").select("resident_id, actor_id").limit(1000),
      service.from("assistant_messages").select("thread_id").limit(1000),
      service.from("assistant_threads").select("id, staff_id").limit(1000),
    ]);
    events = eventRows.data ?? [];
    messages = messageRows.data ?? [];
    threadOwners = new Map((threadRows.data ?? []).map((thread) => [thread.id, thread.staff_id]));
    expect(events.length, "more audit events than the oracle reads; reseed").toBeLessThan(1000);
    expect(messages.length, "more messages than the oracle reads; reseed").toBeLessThan(1000);
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

  it("classifies every table and view the API exposes as resident data or not", async () => {
    expect(everyRelationClassified).toBe(true);
    expect(await exposedRelations()).toEqual([...RESIDENT_DATA_TABLES, ...OTHER_RELATIONS].sort());
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

    it(`${demo.scopeLabel}: sees exactly the rows in scope of every table holding resident data`, async () => {
      const client = clients.get(demo.key)!;
      const counts = await Promise.all(
        RESIDENT_DATA_TABLES.map(async (table) => [table, await countRows(client, table)] as const),
      );
      for (const [table, count] of counts) {
        expect(count, table).toBe(expectedCount(table, demo));
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

  it("a nurse's insert for a resident outside their scope is rejected on every table holding resident data", async () => {
    const harborResident = residentsVisibleTo(seed, account("nurse-harbor")).find(
      (row) => row.status === "current",
    )!;
    const nurse = clients.get("nurse-meadows")!;
    for (const table of RESIDENT_DATA_TABLES) {
      const row = outOfScopeRow(table, harborResident);
      // The union of every table's Insert type is wider than any one table's; the builder pairs them.
      const { data, error } = await nurse
        .from(table)
        .insert(row as never)
        .select("id");
      expect(error?.code, table).toBe("42501");
      expect(data, table).toBeNull();
    }
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

  it("a nurse cannot change a record of a resident outside their scope", async () => {
    const harbor = account("nurse-harbor");
    const meadowsNurse = clients.get("nurse-meadows")!;
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

  it("an anonymous client sees nothing in any table holding resident data", async () => {
    const anonymous = createClient<Database>(url!, key!, { auth: { persistSession: false } });
    for (const table of [...RESIDENT_DATA_TABLES, "facilities", "staff"] as const) {
      expect(await countRows(anonymous, table), table).toBe(0);
    }
  });
});
