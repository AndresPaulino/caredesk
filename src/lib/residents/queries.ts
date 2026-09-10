import "server-only";

import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { Views } from "@/lib/supabase/database.types";

import { RESIDENT_PAGE_SIZE, type ResidentListParams } from "./list-params";

export type ResidentDirectoryEntry = Views<"resident_directory">;

export type ResidentListResult = {
  residents: ResidentDirectoryEntry[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * One page of the resident directory, filtered and sorted from the URL state. Scope is not a
 * parameter: the caller's session decides which rows exist at all (ADR 0003).
 */
export async function listResidents(
  supabase: SupabaseServerClient,
  params: ResidentListParams,
): Promise<ResidentListResult> {
  let query = supabase
    .from("resident_directory")
    .select("*", { count: "exact" })
    .is("archived_at", null);

  if (params.q) query = query.ilike("search_text", `%${escapeLike(params.q)}%`);
  if (params.facility) query = query.eq("facility_id", params.facility);
  if (params.unit) query = query.eq("unit_id", params.unit);
  if (params.status !== "all") query = query.eq("status", params.status);

  const ascending = params.dir === "asc";
  for (const column of sortColumns(params.sort)) {
    query = query.order(column, { ascending, nullsFirst: false });
  }

  const from = (params.page - 1) * RESIDENT_PAGE_SIZE;
  const { data, count, error } = await query.range(from, from + RESIDENT_PAGE_SIZE - 1);
  if (error) throw new Error(`Could not load residents: ${error.message}`);

  const total = count ?? 0;
  return {
    residents: data ?? [],
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / RESIDENT_PAGE_SIZE)),
  };
}

/** One resident from the directory, or null when none is visible under that id. */
export async function getResident(
  supabase: SupabaseServerClient,
  id: string,
): Promise<ResidentDirectoryEntry | null> {
  const { data, error } = await supabase
    .from("resident_directory")
    .select("*")
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not load resident: ${error.message}`);
  return data;
}

export type ScopeOptions = {
  facilities: Array<{ id: string; code: string; name: string }>;
  units: Array<{ id: string; facilityId: string; code: string; name: string }>;
};

/** The facilities and units the caller can see, for the filter controls. */
export async function listScopeOptions(supabase: SupabaseServerClient): Promise<ScopeOptions> {
  const [facilities, units] = await Promise.all([
    supabase.from("facilities").select("id, code, name").is("archived_at", null).order("name"),
    supabase
      .from("units")
      .select("id, facility_id, code, name")
      .is("archived_at", null)
      .order("code"),
  ]);
  if (facilities.error) throw new Error(`Could not load facilities: ${facilities.error.message}`);
  if (units.error) throw new Error(`Could not load units: ${units.error.message}`);

  return {
    facilities: facilities.data,
    units: units.data.map((unit) => ({
      id: unit.id,
      facilityId: unit.facility_id,
      code: unit.code,
      name: unit.name,
    })),
  };
}

type DirectoryColumn = keyof ResidentDirectoryEntry;

function sortColumns(sort: ResidentListParams["sort"]): DirectoryColumn[] {
  switch (sort) {
    case "room":
      return ["facility_name", "unit_code", "room_number"];
    case "facility":
      return ["facility_name", "unit_code", "last_name", "first_name"];
    case "admission":
      return ["admission_date", "last_name", "first_name"];
    case "name":
      return ["last_name", "first_name"];
  }
}

/** `%` and `_` are wildcards in `ilike`; a typed search term should match them literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
