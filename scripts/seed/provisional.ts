#!/usr/bin/env -S pnpm exec tsx
/**
 * Provisional seed for ticket 02: resets the organization and resident tables on the hosted
 * project and rebuilds them from `provisional-data.ts`, creating the three demo logins.
 *
 *   pnpm db:seed
 *
 * Uses the secret key, which is reserved for the seeder and the simulator (ADR 0003). The web
 * app never loads it. Ticket 03 replaces this script with the full generator.
 */
import { existsSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/lib/supabase/database.types";
import { DEMO_ACCOUNTS } from "../../src/lib/demo-accounts";
import { buildProvisionalSeed, residentsVisibleTo, type SeedStaff } from "./provisional-data";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secretKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local to seed the hosted project.",
  );
  process.exit(1);
}

const supabase = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const started = performance.now();
  const seed = buildProvisionalSeed();
  console.info(`Seeding ${new URL(url!).host} with the provisional dataset...`);

  const authUserIds = await ensureAuthUsers(seed.staff);
  await clearTables();

  await insert("facilities", seed.facilities);
  await insert("units", seed.units);
  await insert("rooms", seed.rooms);
  await insert(
    "staff",
    seed.staff.map((member) => ({
      id: member.id,
      auth_user_id: authUserIds.get(member.account.email) ?? null,
      facility_id: member.facility_id,
      role: member.role,
      first_name: member.first_name,
      last_name: member.last_name,
      credentials: member.credentials,
      email: member.email,
    })),
  );
  await insert(
    "staff_unit_assignments",
    seed.staff.flatMap((staff) =>
      staff.unit_ids.map((unit_id) => ({ staff_id: staff.id, unit_id })),
    ),
  );
  await insert("residents", seed.residents);

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.info(
    `Done in ${seconds}s: ${seed.facilities.length} facilities, ${seed.units.length} units, ` +
      `${seed.rooms.length} rooms, ${seed.staff.length} staff, ${seed.residents.length} residents.`,
  );
  console.info("\nDemo accounts and what each can see:");
  for (const account of DEMO_ACCOUNTS) {
    const visible = residentsVisibleTo(seed, account);
    console.info(
      `  ${account.email.padEnd(40)} ${account.password.padEnd(18)} ${visible.length} residents`,
    );
  }
}

/** Creates each demo login if it is missing and makes sure the demo password is current. */
async function ensureAuthUsers(staff: SeedStaff[]): Promise<Map<string, string>> {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`Could not list auth users: ${error.message}`);
  const existing = new Map(data.users.map((user) => [user.email?.toLowerCase(), user.id]));

  const ids = new Map<string, string>();
  for (const member of staff) {
    const { email, password } = member.account;
    const found = existing.get(email.toLowerCase());
    if (found) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(found, { password });
      if (updateError) throw new Error(`Could not update ${email}: ${updateError.message}`);
      ids.set(email, found);
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

/** Deletes every row, children first. PostgREST needs a filter, so match on a never-null column. */
async function clearTables() {
  const steps: Array<[table: keyof Database["public"]["Tables"], column: string]> = [
    ["residents", "id"],
    ["staff_unit_assignments", "staff_id"],
    ["staff", "id"],
    ["rooms", "id"],
    ["units", "id"],
    ["facilities", "id"],
  ];
  for (const [table, column] of steps) {
    const { error } = await supabase.from(table).delete().not(column, "is", null);
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
  }
}

async function insert<T extends keyof Database["public"]["Tables"]>(
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][],
) {
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    // The union of every table's Insert type is wider than any one table's; the caller pairs them.
    const { error } = await supabase.from(table).insert(chunk as never);
    if (error) throw new Error(`Could not insert into ${table}: ${error.message}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
