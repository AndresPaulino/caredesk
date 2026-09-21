/**
 * Runs once before the suite (`globalSetup` in vitest.config.mts). Without a hosted project it
 * says which variables are missing, so the skipped database-backed tests are explained at the
 * top of the run rather than passing in silence. With one, it makes sure the tests start from
 * the seed and nothing else:
 *
 *   1. it refuses to run while the simulator is running (its lock file names the process),
 *      since simulated nurses writing under the tests would change what the tests expect;
 *   2. it reseeds when the database does not match the last seed run: a table's row count
 *      differs from what the seeder recorded, or there are audit events, threads, or messages,
 *      which a fresh seed never has (CAREDESK_RESEED=always reseeds regardless; =never skips
 *      the check and uses the database as it is);
 *   3. it waits until Realtime is streaming, because the first subscription after a reseed,
 *      or after the project has sat idle, can take a while to deliver its first change.
 *
 * Every write it makes for the Realtime check is removed before the first test runs.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

import { DEMO_ACCOUNTS } from "../lib/demo-accounts";
import { runningSimulatorPid } from "../lib/simulator/lock";

import { hostedProjectSkipReason, loadLocalEnv, missingHostedVariables } from "./env";

import type { Database } from "../lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type TableName = keyof Database["public"]["Tables"];

/** Tables the seed leaves empty; any row in them is a change made since. */
const NEVER_SEEDED = ["audit_events", "assistant_threads", "assistant_messages"] as const;

const REALTIME_WAIT_MS = 120_000;

export async function setup() {
  loadLocalEnv();

  const missing = missingHostedVariables();
  if (missing.length > 0) {
    log(`Database-backed tests are skipped: ${hostedProjectSkipReason(missing)}.`);
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  log(`Database-backed tests run against ${new URL(url).host}.`);

  const simulator = runningSimulatorPid();
  if (simulator !== null) {
    throw new Error(
      `The simulator is running (process ${simulator}). Stop it with Ctrl-C before running the tests: its writes would change what the tests expect.`,
    );
  }

  if (!secretKey) {
    log(
      "SUPABASE_SECRET_KEY is not set: suites that write are skipped, and the database is used as it is.",
    );
    return;
  }

  // Reads and cleanups only; the skip header keeps the audit triggers quiet for the latter.
  const service = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-caredesk-audit": "skip" } },
  });

  const mode = process.env.CAREDESK_RESEED ?? "when-needed";
  if (mode === "never") {
    log("CAREDESK_RESEED=never: the database is used as it is.");
  } else {
    const drift = mode === "always" ? ["CAREDESK_RESEED=always"] : await driftFromSeed(service);
    if (drift.length === 0) {
      log("The database matches the last seed run.");
    } else {
      log(`Reseeding (${drift.join("; ")})...`);
      reseed();
    }
  }

  await waitForRealtime({ url, publishableKey, secretKey, service });
}

/** How the database differs from the last seed run: empty when it matches. */
async function driftFromSeed(service: Client): Promise<string[]> {
  const { data: run, error } = await service
    .from("seed_runs")
    .select("row_counts")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not read seed_runs: ${error.message}`);
  if (!run) return ["no seed run is recorded"];

  const expected = run.row_counts as Record<string, number>;
  const tables = [...Object.keys(expected), ...NEVER_SEEDED] as TableName[];
  const counts = await Promise.all(
    tables.map(async (table) => [table, await countRows(service, table)] as const),
  );
  return counts.flatMap(([table, count]) => {
    const seeded = expected[table] ?? 0;
    return count === seeded ? [] : [`${table} has ${count} rows, the seed ${seeded}`];
  });
}

async function countRows(client: Client, table: TableName): Promise<number> {
  // A head-only count works on any table; the client's overloads differ only in row type.
  const { count, error } = await client
    .from(table as "residents")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

/** Runs `pnpm db:seed` and shows its output only if it fails. */
function reseed() {
  const started = Date.now();
  const require = createRequire(import.meta.url);
  try {
    execFileSync(process.execPath, [require.resolve("tsx/cli"), "scripts/seed/reset.ts"], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  } catch (error) {
    const output = error as { stdout?: string; stderr?: string };
    throw new Error(`Reseeding failed:\n${output.stdout ?? ""}${output.stderr ?? ""}`);
  }
  log(`Reseeded in ${elapsed(started)}.`);
}

type RealtimeOptions = { url: string; publishableKey: string; secretKey: string; service: Client };

/**
 * Subscribes as the admin, writes a progress note as a simulated nurse, and waits to hear its
 * audit event, trying again with a fresh subscription and note when nothing arrives, until
 * Realtime delivers or two minutes pass. The note and its event are removed either way.
 */
async function waitForRealtime({ url, publishableKey, secretKey, service }: RealtimeOptions) {
  const admin = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const account = DEMO_ACCOUNTS.find((demo) => demo.role === "admin")!;
  const { error } = await admin.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw new Error(`Could not sign in as ${account.email}: ${error.message}`);

  const { data: resident } = await service
    .from("residents")
    .select("id")
    .eq("status", "current")
    .limit(1)
    .single();
  const { data: nurse } = await service
    .from("staff")
    .select("id")
    .eq("is_simulated", true)
    .limit(1)
    .single();
  if (!resident || !nurse)
    throw new Error("No current resident or simulated nurse; run `pnpm db:seed`.");
  const writer = createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-caredesk-actor": nurse.id } },
  });

  const started = Date.now();
  let attempt = 0;
  try {
    while (Date.now() - started < REALTIME_WAIT_MS) {
      attempt += 1;
      const delivered = await probeRealtime({
        admin,
        writer,
        service,
        residentId: resident.id,
        actorId: nurse.id,
        waitMs: attempt === 1 ? 10_000 : 20_000,
      });
      if (delivered) {
        log(
          `Realtime is streaming (${elapsed(started)}${attempt > 1 ? `, attempt ${attempt}` : ""}).`,
        );
        return;
      }
      log(`Realtime has not delivered a change yet (${elapsed(started)}); subscribing again.`);
    }
    log("Warning: Realtime delivered nothing in two minutes; the activity feed tests may fail.");
  } finally {
    await admin.removeAllChannels();
    await admin.auth.signOut();
  }
}

type ProbeOptions = {
  admin: Client;
  writer: Client;
  service: Client;
  residentId: string;
  actorId: string;
  waitMs: number;
};

/** One subscription, one note, one wait. True when the note's audit event was announced. */
async function probeRealtime({
  admin,
  writer,
  service,
  residentId,
  actorId,
  waitMs,
}: ProbeOptions) {
  const heard = new Set<string>();
  let channel: RealtimeChannel | null = null;
  try {
    channel = admin
      .channel(`test-setup-${crypto.randomUUID()}`)
      .on<{ id: string }>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_events" },
        (payload) => heard.add(payload.new.id),
      );
    await new Promise<void>((resolve, reject) => {
      channel!.subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(error ?? new Error(`Realtime ${status}`));
        }
      });
    });
  } catch (error) {
    log(`Realtime subscription failed: ${error instanceof Error ? error.message : error}`);
    if (channel) await admin.removeChannel(channel);
    await sleep(2_000);
    return false;
  }
  // The join is acknowledged a moment before the server starts streaming changes to it.
  await sleep(2_000);

  const { data: note, error } = await writer
    .from("progress_notes")
    .insert({
      resident_id: residentId,
      written_by: actorId,
      written_at: new Date().toISOString(),
      body: "Realtime check from the test setup; removed right away.",
    })
    .select("id")
    .single();
  if (error) throw new Error(`Could not write the Realtime check note: ${error.message}`);
  const { data: event } = await service
    .from("audit_events")
    .select("id")
    .eq("record_id", note.id)
    .single();
  if (!event) throw new Error("The Realtime check note produced no audit event.");

  const until = Date.now() + waitMs;
  while (!heard.has(event.id) && Date.now() < until) await sleep(250);
  const delivered = heard.has(event.id);

  await admin.removeChannel(channel);
  await service.from("audit_events").delete().eq("record_id", note.id);
  await service.from("progress_notes").delete().eq("id", note.id);
  return delivered;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const elapsed = (since: number) => `${Math.round((Date.now() - since) / 1000)} s`;

function log(message: string) {
  console.info(`[test setup] ${message}`);
}
