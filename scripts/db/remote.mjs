#!/usr/bin/env node
/**
 * Runs a Supabase CLI command against the hosted project using DATABASE_URL from .env.local.
 * No Docker and no `supabase link` needed.
 *
 *   node scripts/db/remote.mjs db push          # apply pending migrations
 *   node scripts/db/remote.mjs migration list   # compare local and remote migration history
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error(
    [
      "DATABASE_URL is not set.",
      'Add it to .env.local. In the Supabase dashboard open Connect, choose "Session pooler",',
      "copy the URI, and replace [YOUR-PASSWORD] with the database password (percent-encoded).",
      "See docs/database.md.",
    ].join("\n"),
  );
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/db/remote.mjs <supabase subcommand...>");
  process.exit(1);
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(pnpm, ["exec", "supabase", ...args, "--db-url", databaseUrl], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);

/** Minimal .env loader: KEY=VALUE lines, optional quotes, # comments. Never overrides existing values. */
function loadEnvFile(name) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
