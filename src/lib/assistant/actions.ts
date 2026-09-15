"use server";

import { z } from "zod";

import { getCurrentStaff } from "@/lib/auth/current-staff";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { LoadedThread, ThreadSummary } from "./protocol";
import { listThreads, loadThread } from "./threads";

/**
 * The drawer's way to its saved threads. Both run as the signed-in staff member, so the thread
 * policies decide what comes back: only the caller's own threads, and a thread of someone
 * else's is null, the same as one that does not exist.
 */

export async function listAssistantThreads(): Promise<ThreadSummary[]> {
  const staff = await getCurrentStaff();
  if (!staff) return [];
  const supabase = await createSupabaseServerClient();
  return listThreads(supabase);
}

export async function loadAssistantThread(id: string): Promise<LoadedThread | null> {
  const staff = await getCurrentStaff();
  if (!staff) return null;
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createSupabaseServerClient();
  return loadThread(supabase, id);
}
