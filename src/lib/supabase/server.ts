import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env/public";

/**
 * Supabase client for Server Components, Server Functions, and Route Handlers.
 * It acts as the signed-in staff member (or anonymously before sign-in), never as the
 * service role, so Row Level Security applies to every query (ADR 0003).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot write cookies. Session refresh happens in proxy.ts
            // once sign-in exists, so a failed write here is safe to ignore.
          }
        },
      },
    },
  );
}
