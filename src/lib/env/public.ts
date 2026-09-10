import { parseEnv, publicEnvSchema, type PublicEnv } from "./schema";

/**
 * Validated public environment, safe to import from browser code.
 * Each variable is referenced by its full name so Next.js can inline it into the browser bundle.
 */
export const publicEnv: PublicEnv = parseEnv(publicEnvSchema, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
