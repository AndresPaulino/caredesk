#!/usr/bin/env -S pnpm exec tsx
/**
 * Runs the simulator: the ten simulated nurses record vitals, give medications, write notes,
 * report incidents, update resident details, and schedule appointments on a shift rhythm,
 * until stopped. The dashboard feed and tiles move as they work.
 *
 *   pnpm simulate                 # one action every 30 to 90 seconds by day, quieter at night
 *   pnpm simulate --pace 10       # ten times faster, for a recording or a quick check
 *   pnpm simulate --for 2m        # stop after two minutes (also 90s, 1h)
 *   pnpm simulate --seed 7        # replay the same sequence of choices
 *
 * Ctrl-C stops it after the action in flight. Writes go through the service role with the
 * acting nurse named in the x-caredesk-actor header, so the audit trail and the feed show the
 * nurse, not a system account (docs/database.md). Exits 1 if any write was rejected.
 */
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { createRandom } from "../../src/lib/seed/random";
import {
  ACTION_KINDS,
  ACTION_LABELS,
  createSimulator,
  createSupabaseStore,
  loadSimulatedNurses,
  type SimulatorSummary,
  type StepResult,
} from "../../src/lib/simulator";
import { BASE_INTERVAL_MS } from "../../src/lib/simulator/rhythm";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (!url || !secretKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local to run the simulator.",
  );
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    pace: { type: "string", default: "1" },
    for: { type: "string" },
    seed: { type: "string" },
  },
});

const pace = Number(args.pace);
if (!(pace > 0)) {
  console.error(
    `--pace must be a positive number (1 is real time, 10 is ten times faster), got ${args.pace}`,
  );
  process.exit(1);
}
const durationMs = args.for ? parseDuration(args.for) : null;
if (args.for && durationMs === null) {
  console.error(`--for must be a duration such as 90s, 2m, or 1h, got ${args.for}`);
  process.exit(1);
}
const seed = args.seed ? Number(args.seed) : Date.now();
if (!Number.isInteger(seed)) {
  console.error(`--seed must be an integer, got ${args.seed}`);
  process.exit(1);
}

function parseDuration(text: string): number | null {
  const match = /^(\d+)(s|m|h)$/.exec(text.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  return amount * { s: 1_000, m: 60_000, h: 3_600_000 }[match[2] as "s" | "m" | "h"];
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function printStep(result: StepResult) {
  const time = timeFormat.format(result.at);
  if (result.status === "idle") {
    console.info(`${time}  ${"".padEnd(12)} ${result.nurseName.padEnd(26)} ${result.reason}`);
    return;
  }
  const line = `${time}  ${result.place.padEnd(12)} ${result.nurseName.padEnd(26)} ${result.summary}`;
  if (result.status === "done") console.info(line);
  else console.error(`${line}\n${"".padEnd(42)} rejected: ${result.message}`);
}

function printSummary(summary: SimulatorSummary) {
  const seconds = Math.round((summary.stoppedAt.getTime() - summary.startedAt.getTime()) / 1000);
  const elapsed =
    seconds >= 60
      ? `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`
      : `${seconds}s`;
  console.info(
    `\nStopped after ${elapsed}: ${summary.done} action${summary.done === 1 ? "" : "s"} recorded, ${summary.rejected} rejected, ${summary.idle} idle, ${summary.errors} error${summary.errors === 1 ? "" : "s"}.`,
  );
  console.info(
    "  " + ACTION_KINDS.map((kind) => `${ACTION_LABELS[kind]} ${summary.byKind[kind]}`).join(", "),
  );
}

async function main() {
  const options = { url: url!, secretKey: secretKey! };
  const nurses = await loadSimulatedNurses(options);
  if (nurses.length === 0) {
    throw new Error("No simulated staff found. Run `pnpm db:seed` first.");
  }

  const [min, max] = BASE_INTERVAL_MS.map((ms) => Math.round(ms / pace / 1000));
  console.info(
    `Simulating ${nurses.length} nurses at ${new URL(url!).host}, pace ${pace}: one action every ${min} to ${max} seconds by day, quieter at night${durationMs ? `, for ${args.for}` : ""}. Ctrl-C stops.\n`,
  );
  for (const nurse of nurses) {
    console.info(`  ${`${nurse.first_name} ${nurse.last_name}`.padEnd(24)} ${nurse.where}`);
  }
  console.info("");

  const controller = new AbortController();
  const stop = () => {
    if (controller.signal.aborted) return;
    console.info("\nStopping after the action in flight...");
    controller.abort();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const simulator = createSimulator({
    store: createSupabaseStore(options),
    nurses,
    random: createRandom(seed),
    pace,
    onStep: printStep,
    onError: (error) => console.error(`  error: ${error instanceof Error ? error.message : error}`),
  });
  const summary = await simulator.run({
    signal: controller.signal,
    until: durationMs ? new Date(Date.now() + durationMs) : undefined,
  });
  printSummary(summary);
  process.exit(summary.rejected > 0 || summary.errors > 0 ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
