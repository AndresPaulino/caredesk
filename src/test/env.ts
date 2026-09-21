import { existsSync } from "node:fs";

/**
 * The hosted project the database-backed tests run against. `.env.local` supplies the
 * variables locally; CI sets them from secrets on the main branch and leaves placeholders
 * everywhere else, so a placeholder URL counts as "not configured". Every database-backed
 * suite, the test setup, and the browser test decide with these two functions, so a run
 * without a hosted project always says which variables it is missing.
 */

/** Loads `.env.local` when present. Variables already in the environment win, so CI's values are never overridden. */
export function loadLocalEnv(): void {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export type HostedProjectNeeds = {
  /** The suite writes and cleans up with the service role, or reseeds. */
  secretKey?: boolean;
  /** The suite calls the model. */
  anthropic?: boolean;
};

const value = (name: string) => process.env[name]?.trim() || undefined;

/** The variables a database-backed test needs that are not set: empty when it can run. */
export function missingHostedVariables(needs: HostedProjectNeeds = {}): string[] {
  const missing: string[] = [];
  const url = value("NEXT_PUBLIC_SUPABASE_URL");
  if (!url || url.includes("placeholder")) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
    missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (needs.secretKey && !value("SUPABASE_SECRET_KEY")) missing.push("SUPABASE_SECRET_KEY");
  if (needs.anthropic && !value("ANTHROPIC_API_KEY")) missing.push("ANTHROPIC_API_KEY");
  return missing;
}

/** One line saying why a suite is skipped, from the variables it is missing. */
export function hostedProjectSkipReason(missing: string[]): string {
  return `${missing.join(", ")} not set; copy .env.example to .env.local to run against the hosted project`;
}
