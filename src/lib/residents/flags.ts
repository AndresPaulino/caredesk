import "server-only";

import { RECENT_FALL_DAYS, residentFlags, type ResidentFlag } from "@/lib/clinical/flags";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import type { ResidentDirectoryEntry } from "./queries";

/**
 * Flags for one page of the resident list: three reads over the page's ids, through the
 * caller's session like every other read (ADR 0003).
 */
export async function listResidentFlags(
  supabase: SupabaseServerClient,
  residents: readonly ResidentDirectoryEntry[],
  now: Date = new Date(),
): Promise<Record<string, ResidentFlag[]>> {
  const ids = residents.map((resident) => resident.id);
  if (ids.length === 0) return {};
  const since = new Date(now.getTime() - RECENT_FALL_DAYS * 86_400_000).toISOString();

  const [allergies, assessments, incidents] = await Promise.all([
    supabase
      .from("allergies")
      .select("resident_id, description")
      .in("resident_id", ids)
      .is("archived_at", null),
    supabase
      .from("assessments")
      .select("resident_id, performed_at, score")
      .in("resident_id", ids)
      .eq("kind", "fall_risk")
      .is("archived_at", null),
    supabase
      .from("incidents")
      .select("resident_id, kind, occurred_at")
      .in("resident_id", ids)
      .eq("kind", "fall")
      .gte("occurred_at", since)
      .is("archived_at", null),
  ]);
  for (const result of [allergies, assessments, incidents]) {
    if (result.error) throw new Error(`Could not load resident flags: ${result.error.message}`);
  }

  const byResident = <Row extends { resident_id: string }>(rows: Row[] | null) => {
    const map = new Map<string, Row[]>();
    for (const row of rows ?? [])
      map.set(row.resident_id, [...(map.get(row.resident_id) ?? []), row]);
    return map;
  };
  const allergiesFor = byResident(allergies.data);
  const assessmentsFor = byResident(assessments.data);
  const incidentsFor = byResident(incidents.data);

  return Object.fromEntries(
    residents.map((resident) => [
      resident.id,
      residentFlags(
        {
          codeStatus: resident.code_status,
          allergies: allergiesFor.get(resident.id) ?? [],
          fallRiskAssessments: assessmentsFor.get(resident.id) ?? [],
          incidents: incidentsFor.get(resident.id) ?? [],
        },
        now,
      ),
    ]),
  );
}
