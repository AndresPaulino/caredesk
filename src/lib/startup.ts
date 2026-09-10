import "server-only";

import { checkAnthropicConfiguration } from "@/lib/anthropic";
import { serverEnv } from "@/lib/env/server";

/**
 * Runs once when the server starts (see `src/instrumentation.ts`).
 * Importing `serverEnv` has already validated every variable; this reports what was found
 * and confirms the assistant is configured, without spending an API call.
 */
export function assertStartupConfiguration(): void {
  const anthropic = checkAnthropicConfiguration();
  if (!anthropic.ok) throw new Error(`Assistant configuration failed: ${anthropic.reason}`);

  const supabaseHost = new URL(serverEnv.NEXT_PUBLIC_SUPABASE_URL).host;
  console.info(`[caredesk] configuration ok. supabase=${supabaseHost} model=${anthropic.model}`);
}
