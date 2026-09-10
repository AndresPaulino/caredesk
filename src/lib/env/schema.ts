import { z } from "zod";

/**
 * Environment configuration for CareDesk.
 *
 * `publicEnvSchema` covers the NEXT_PUBLIC_ variables Next.js inlines into the browser bundle.
 * `serverEnvSchema` covers everything the server needs, public variables included.
 * `parseEnv` validates a source against a schema and, on failure, throws one error that names
 * every missing or malformed variable so a bad `.env.local` is diagnosed in a single read.
 */

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .url({ protocol: /^https$/, error: "expected an https URL" })
    .describe("the Supabase project URL, e.g. https://<ref>.supabase.co"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1)
    .describe("the Supabase publishable key (sb_publishable_...) or legacy anon key"),
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SECRET_KEY: z
    .string()
    .min(1)
    .optional()
    .describe("the Supabase secret key (sb_secret_...); used only by the seeder and simulator"),
  ANTHROPIC_API_KEY: z
    .string()
    .startsWith("sk-ant-", { error: "expected a Claude Console API key starting with sk-ant-" })
    .describe("a Claude Console API key starting with sk-ant-"),
  ANTHROPIC_MODEL: z
    .string()
    .min(1)
    .default("claude-sonnet-5")
    .describe("the Claude model the assistant uses"),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, { error: "expected a postgresql:// connection string" })
    .optional()
    .describe("the Postgres connection string; used only by `pnpm db:push`"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvSource = Record<string, string | undefined>;

export class EnvError extends Error {
  readonly name = "EnvError";

  constructor(
    message: string,
    /** Names of the variables that failed validation. */
    readonly variables: string[],
  ) {
    super(message);
  }
}

/**
 * Validates `source` against `schema`. Blank values count as missing.
 * Throws an `EnvError` whose message lists every offending variable with a hint.
 */
export function parseEnv<S extends z.ZodObject>(schema: S, source: EnvSource): z.output<S> {
  const cleaned: EnvSource = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value === undefined || value.trim() === "" ? undefined : value,
    ]),
  );

  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const variables: string[] = [];
  const lines: string[] = [];
  for (const issue of result.error.issues) {
    const name = String(issue.path[0] ?? "(root)");
    if (variables.includes(name)) continue;
    variables.push(name);

    const hint = schema.shape[name]?.description;
    const detail = cleaned[name] === undefined ? "missing" : issue.message;
    lines.push(`  - ${name}: ${detail}${hint ? ` (${hint})` : ""}`);
  }

  throw new EnvError(
    [
      'Invalid environment configuration. Fix the following in .env.local (see README.md, "Run it locally"):',
      ...lines,
    ].join("\n"),
    variables,
  );
}
