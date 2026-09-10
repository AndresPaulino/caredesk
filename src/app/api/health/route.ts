import { checkAnthropicConfiguration } from "@/lib/anthropic";
import { checkDatabase } from "@/lib/health";

export const dynamic = "force-dynamic";

/** JSON form of the health page, for scripts and uptime checks. 503 when any check fails. */
export async function GET() {
  const database = await checkDatabase();
  const anthropic = checkAnthropicConfiguration();
  const ok = database.ok && anthropic.ok;

  return Response.json(
    { ok, checkedAt: new Date().toISOString(), database, anthropic },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
