#!/usr/bin/env -S pnpm exec tsx
/**
 * Resets the hosted project and rebuilds the full Willowbrook Care dataset: the organization,
 * about 1,000 residents with their clinical records, and the three demo logins.
 *
 *   pnpm db:seed                                  # "now" is the current hour
 *   pnpm db:seed --anchor 2026-09-09T18:00:00Z    # pin the instant recent records are placed around
 *   pnpm db:seed --seed 7                         # a different population
 *
 * Uses the secret key, which is reserved for the seeder and the simulator (ADR 0003). The web
 * app never loads it. The publishable key is used only to check that each demo password still
 * works. Running it twice with the same arguments yields identical data.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

import { DEMO_ACCOUNTS } from "../../src/lib/demo-accounts";
import {
  CLINICAL_TABLES,
  buildSeed,
  defaultAnchor,
  residentsVisibleTo,
  tableRowCounts,
  type SeedStaffMember,
  type TableName,
} from "../../src/lib/seed";
import type { Database } from "../../src/lib/supabase/database.types";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !publishableKey || !secretKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY must be set in .env.local to seed the hosted project.",
  );
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    anchor: { type: "string" },
    seed: { type: "string" },
  },
});
const anchor = args.anchor ? new Date(args.anchor) : defaultAnchor();
if (Number.isNaN(anchor.getTime())) {
  console.error(`--anchor must be an ISO instant, got ${args.anchor}`);
  process.exit(1);
}
const seedNumber = args.seed ? Number(args.seed) : undefined;
if (seedNumber !== undefined && !Number.isInteger(seedNumber)) {
  console.error(`--seed must be an integer, got ${args.seed}`);
  process.exit(1);
}

const supabase = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/** Signs in as a demo account only to check its password (see passwordWorks). */
const passwordCheck = createClient<Database>(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CHUNK_SIZE = 1000;
const CONCURRENCY = 6;

async function main() {
  const started = performance.now();
  console.info(`Generating the seed (anchor ${anchor.toISOString()})...`);
  const seed = buildSeed({ seed: seedNumber, anchor });
  const counts = tableRowCounts(seed);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  console.info(`Seeding ${new URL(url!).host} with ${total.toLocaleString()} rows...`);

  const authUserIds = await ensureAuthUsers(seed.staff.filter((member) => member.account));

  const { error: resetError } = await supabase.rpc("reset_demo_data");
  if (resetError) throw new Error(`Could not reset the demo data: ${resetError.message}`);

  await insert("facilities", seed.facilities);
  await insert("units", seed.units);
  await insert("rooms", seed.rooms);
  await insert(
    "staff",
    seed.staff.map((member) => ({
      id: member.id,
      auth_user_id: member.account ? (authUserIds.get(member.account.email) ?? null) : null,
      facility_id: member.facility_id,
      role: member.role,
      first_name: member.first_name,
      last_name: member.last_name,
      credentials: member.credentials,
      email: member.email,
      is_simulated: member.is_simulated,
    })),
  );
  await insert("staff_unit_assignments", seed.staff_unit_assignments);
  await insert("residents", seed.residents);
  for (const table of CLINICAL_TABLES) await insert(table, seed[table]);

  const { error: runError } = await supabase.from("seed_runs").insert({
    seed_number: seed.seedNumber,
    anchor: seed.anchor.toISOString(),
    row_counts: counts,
  });
  if (runError) throw new Error(`Could not record the seed run: ${runError.message}`);

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.info(`\nDone in ${seconds}s.`);
  printCounts(counts);
  console.info("\nDemo accounts and what each can see:");
  for (const account of DEMO_ACCOUNTS) {
    const visible = residentsVisibleTo(seed, account);
    console.info(
      `  ${account.email.padEnd(40)} ${account.password.padEnd(18)} ${visible.length} residents`,
    );
  }
}

/**
 * Creates each demo login if it is missing and makes sure the demo password works. The password
 * is reset only when signing in with it fails: a reset through the admin API signs the account
 * out everywhere, which would end every browser session open during a routine reseed.
 */
async function ensureAuthUsers(staff: SeedStaffMember[]): Promise<Map<string, string>> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);
  const existing = new Map(data.users.map((user) => [user.email?.toLowerCase(), user.id]));

  const ids = new Map<string, string>();
  for (const member of staff) {
    const { email, password } = member.account!;
    const found = existing.get(email.toLowerCase());
    if (found) {
      ids.set(email, found);
      if (await passwordWorks(email, password)) continue;
      const { error: updateError } = await supabase.auth.admin.updateUserById(found, { password });
      if (updateError) throw new Error(`Could not update ${email}: ${updateError.message}`);
      console.info(`  reset the password for ${email}; its open sessions are signed out`);
      continue;
    }
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw new Error(`Could not create ${email}: ${createError?.message ?? "no user returned"}`);
    }
    ids.set(email, created.user.id);
    console.info(`  created auth user ${email}`);
  }
  return ids;
}

/** Whether a sign-in with this password succeeds. The session it creates is ended right away. */
async function passwordWorks(email: string, password: string): Promise<boolean> {
  const { error } = await passwordCheck.auth.signInWithPassword({ email, password });
  if (error) return false;
  await passwordCheck.auth.signOut({ scope: "local" });
  return true;
}

/** Inserts in chunks, a few chunks at a time. Ids are pre-assigned, so order within a table is free. */
async function insert<T extends TableName>(
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][],
) {
  const chunks: Array<typeof rows> = [];
  for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
    chunks.push(rows.slice(offset, offset + CHUNK_SIZE));
  }
  for (let offset = 0; offset < chunks.length; offset += CONCURRENCY) {
    await Promise.all(
      chunks.slice(offset, offset + CONCURRENCY).map(async (chunk) => {
        // The union of every table's Insert type is wider than any one table's; the caller pairs them.
        const { error } = await supabase.from(table).insert(chunk as never);
        if (error) throw new Error(`Could not insert into ${table}: ${error.message}`);
      }),
    );
  }
  process.stdout.write(`  ${table.padEnd(24)} ${String(rows.length).padStart(6)}\n`);
}

function printCounts(counts: Record<string, number>) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  console.info(`  ${"total".padEnd(24)} ${String(total).padStart(6)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
