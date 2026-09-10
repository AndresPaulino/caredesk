import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env/public";

/** Supabase client for Client Components. Shares the session cookie with the server client. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
