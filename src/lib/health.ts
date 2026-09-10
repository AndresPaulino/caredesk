import "server-only";

import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DatabaseHealth =
  | { ok: true; databaseTime: string; latencyMs: number }
  | { ok: false; error: string; latencyMs: number };

/**
 * Proves the hosted Supabase project is reachable by calling the `health_check` function,
 * which returns the database's current time. Runs with the caller's session, like every
 * other query.
 */
export async function checkDatabase(): Promise<DatabaseHealth> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("health_check");

    if (error) return { ok: false, error: describeError(error), latencyMs: elapsed() };
    if (typeof data !== "string") {
      return {
        ok: false,
        error: "health_check returned an unexpected value",
        latencyMs: elapsed(),
      };
    }
    return { ok: true, databaseTime: data, latencyMs: elapsed() };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: `Could not reach Supabase: ${message}`, latencyMs: elapsed() };
  }
}

function describeError(error: PostgrestError): string {
  // PGRST202: the function does not exist yet, which means migrations have not been applied.
  if (error.code === "PGRST202") {
    return "The health_check function is not in the database yet. Run `pnpm db:push` to apply migrations.";
  }
  return `${error.message}${error.code ? ` (${error.code})` : ""}`;
}
