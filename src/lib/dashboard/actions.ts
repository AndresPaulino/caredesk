"use server";

import { z } from "zod";

import { getActivityEntries } from "@/lib/audit/events";
import { toFeedEntry, type FeedEntry } from "@/lib/audit/feed";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const idsSchema = z.array(z.uuid()).min(1).max(50);

/**
 * The feed's story for events Realtime just announced. Realtime already applied the events
 * policy to decide who hears about an insert; reading the event back through the caller's
 * session applies it again and resolves the actor, the resident, and the names the story
 * needs. Anything the caller may not see, or a malformed request, comes back empty.
 */
export async function loadFeedEntries(ids: string[]): Promise<FeedEntry[]> {
  const staff = await getCurrentStaff();
  if (!staff) return [];
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return [];

  const supabase = await createSupabaseServerClient();
  const entries = await getActivityEntries(supabase, parsed.data);
  return entries.map(toFeedEntry);
}
