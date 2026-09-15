import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResidentDirectoryEntry } from "@/lib/residents/queries";
import type { RecordTabKey } from "@/lib/residents/record-tabs";
import type { Database } from "@/lib/supabase/database.types";
import { escapeLike } from "@/lib/supabase/like";
import { addDays, atZoned, dateInZone, daysBetween } from "@/lib/time";

import type { SourceRef } from "../protocol";

/**
 * What every tool shares: the caller's client and the instant of the question, the source
 * reference a result carries for its chips, and the small conveniences the tools' queries
 * repeat (the staff embed, calendar arithmetic, resolving "Unit B" to unit ids within the
 * caller's scope).
 */

export type AssistantClient = SupabaseClient<Database>;

export type ToolContext = {
  supabase: AssistantClient;
  /** The instant the question was asked; "today" and "days ago" are measured from it. */
  now: Date;
};

export type { SourceRef };

export const STAFF_COLUMNS = "id, first_name, last_name, credentials, role";

/** `*` plus the staff member behind one foreign key, as `staff`. */
export const withStaff = <Key extends string>(foreignKey: Key) =>
  `*, staff:staff!${foreignKey} (${STAFF_COLUMNS})` as const;

export function sourceFor(resident: ResidentDirectoryEntry, tab: RecordTabKey | null): SourceRef {
  return { residentId: resident.id, residentName: resident.full_name, tab };
}

// ---------------------------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------------------------

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A window boundary as the model gives it: a calendar date, meaning that whole day in the
 * facilities' time zone (the start of it for `since`, the start of the next day for `until`),
 * or an ISO 8601 instant. Undefined stays undefined.
 */
export function instantFrom(
  value: string | undefined,
  edge: "since" | "until",
): string | undefined {
  if (value === undefined) return undefined;
  if (CALENDAR_DATE.test(value)) {
    return atZoned(edge === "since" ? value : addDays(value, 1)).toISOString();
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`"${value}" is not a date or an instant`);
  return instant.toISOString();
}

/** The calendar date of an instant and how many days before today it was. */
export function calendar(instant: string, now: Date): { on: string; daysAgo: number } {
  const on = dateInZone(new Date(instant));
  return { on, daysAgo: daysBetween(on, dateInZone(now)) };
}

// ---------------------------------------------------------------------------------------------
// Scope: "Unit B", "Harbor", "Willowbrook Meadows" to ids the caller may see
// ---------------------------------------------------------------------------------------------

export type ScopeInput = {
  /** A unit code ("B") or part of a unit name. */
  unit?: string;
  /** A facility code ("MDW") or part of a facility name. */
  facility?: string;
};

export type ScopeSummary = {
  /** "Unit B at Willowbrook Meadows", "Willowbrook Harbor", or "everything you can see". */
  description: string;
  /** The units the filter matched, by name; empty when no unit was asked for or none matched. */
  units: string[];
  facilities: string[];
};

export type ResolvedScope = ScopeSummary & {
  /** Null when no unit was asked for; empty when one was and nothing in scope matched. */
  unitIds: string[] | null;
  facilityIds: string[] | null;
};

/**
 * The units and facilities a question names, among those the caller may see. A single letter
 * is a unit code; a short uppercase code is a facility code; anything else matches part of a
 * name. A unit filter is narrowed to the facility when both are given. Nothing matching is an
 * empty list, not the whole scope: "Unit F" finds no residents rather than everyone.
 */
export async function resolveScope(
  supabase: AssistantClient,
  { unit, facility }: ScopeInput,
): Promise<ResolvedScope> {
  const unitTerm = unit?.trim() || undefined;
  const facilityTerm = facility?.trim() || undefined;
  if (!unitTerm && !facilityTerm) {
    return {
      description: "everything you can see",
      units: [],
      facilities: [],
      unitIds: null,
      facilityIds: null,
    };
  }

  const { data: units, error } = await supabase
    .from("units")
    .select("id, code, name, facility:facilities (id, code, name)")
    .order("name");
  if (error) throw new Error(`Could not load units: ${error.message}`);

  const facilities = new Map<string, { id: string; code: string; name: string }>();
  for (const row of units ?? []) if (row.facility) facilities.set(row.facility.id, row.facility);

  const matchedFacilities = facilityTerm
    ? [...facilities.values()].filter((row) =>
        /^[A-Z]{2,4}$/.test(facilityTerm)
          ? row.code === facilityTerm
          : row.name.toLowerCase().includes(facilityTerm.toLowerCase()),
      )
    : null;
  const facilityIds = matchedFacilities ? new Set(matchedFacilities.map((row) => row.id)) : null;

  const matchedUnits = unitTerm
    ? (units ?? []).filter(
        (row) =>
          (!facilityIds || (row.facility && facilityIds.has(row.facility.id))) &&
          (/^[a-z]$/i.test(unitTerm)
            ? row.code.toUpperCase() === unitTerm.toUpperCase()
            : row.name.toLowerCase().includes(unitTerm.toLowerCase())),
      )
    : null;

  // Units are named "Unit B" at every facility, so a unit is labeled with its facility.
  const unitNames =
    matchedUnits?.map((row) => (row.facility ? `${row.name} at ${row.facility.name}` : row.name)) ??
    [];
  const facilityNames = matchedFacilities?.map((row) => row.name) ?? [];
  const description = matchedUnits
    ? unitNames.length > 0
      ? listNames(unitNames)
      : `no unit matching “${unitTerm}”${facilityTerm ? ` at ${facilityNames.length > 0 ? listNames(facilityNames) : `“${facilityTerm}”`}` : ""}`
    : facilityNames.length > 0
      ? listNames(facilityNames)
      : `no facility matching “${facilityTerm}”`;

  return {
    description,
    units: unitNames,
    facilities: facilityNames,
    unitIds: matchedUnits ? matchedUnits.map((row) => row.id) : null,
    facilityIds: matchedFacilities ? matchedFacilities.map((row) => row.id) : null,
  };
}

/** Residents in scope on the units or at the facilities, current ones by default. */
export function residentsInScope(
  supabase: AssistantClient,
  scope: ResolvedScope,
  { status = "current" }: { status?: "current" | "former" | "all" } = {},
) {
  let query = supabase.from("resident_directory").select("*").is("archived_at", null);
  if (scope.unitIds) query = query.in("unit_id", scope.unitIds);
  else if (scope.facilityIds) query = query.in("facility_id", scope.facilityIds);
  if (status !== "all") query = query.eq("status", status);
  return query;
}

export function listNames(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** A case-insensitive "contains" pattern for `ilike`. */
export function contains(term: string): string {
  return `%${escapeLike(term.trim())}%`;
}

/** Runs `fetch` over slices of `ids` so a filter list never makes the request URL too long. */
export async function inChunks<T>(
  ids: readonly string[],
  fetch: (chunk: string[]) => Promise<T[]>,
  size = 100,
): Promise<T[]> {
  const results: T[] = [];
  for (let start = 0; start < ids.length; start += size) {
    results.push(...(await fetch(ids.slice(start, start + size))));
  }
  return results;
}

/** Reads every row of a query that may exceed PostgREST's per-response cap, a page at a time. */
export async function allRows<Row>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  label: string,
  pageSize = 1000,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
