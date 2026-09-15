import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "../supabase/database.types";

import {
  isAuditedTable,
  referenceKind,
  type AuditReferenceKind,
  type AuditReferences,
} from "./columns";
import {
  describeAuditEvent,
  type AuditActor,
  type AuditEvent,
  type AuditOperation,
  type AuditTrailEntry,
  type AuditValues,
} from "./describe";
import { FEED_LIMIT } from "./feed";

/**
 * Audit events read through the caller's session and told as a story. The events policy is
 * the resident's own scope (ADR 0003), so a resident outside scope has no events, the same as
 * one who does not exist; an assistant access event that concerns no resident is readable by
 * the staff member it is attributed to and by admins. The actor, the resident, and the names
 * behind foreign keys (rooms, units, staff, medication orders) are read through their own
 * policies; a name outside the caller's scope comes back missing and is shown as such.
 *
 * Four readers share one loader: the audit trail on a resident's page and the assistant's
 * audit trail tool (one resident, with filters), the activity feed on the dashboard and the
 * assistant's activity tool (the most recent events across the caller's scope, or across the
 * units and facilities asked about), and the feed's live updates (events by id, as Realtime
 * announces them).
 */

type Client = SupabaseClient<Database>;

export type AuditEventResident = { id: string; first_name: string; last_name: string } | null;

/** A trail entry that also names the resident it belongs to, for readers spanning residents. */
export type ActivityEntry = AuditTrailEntry & { resident: AuditEventResident };

export type AuditTrail = {
  /** Newest first, at most `limit` of them. */
  entries: AuditTrailEntry[];
  /** How many events match in all. */
  total: number;
};

export type Activity = {
  /** Newest first, at most `limit` of them. */
  entries: ActivityEntry[];
  /** How many events match in all. */
  total: number;
};

export const AUDIT_TRAIL_LIMIT = 200;

export type AuditEventFilters = {
  /** Only events at or after this instant (ISO 8601). */
  since?: string;
  /** Only events before this instant (ISO 8601). */
  until?: string;
  /** Only events on these tables; every table by default. */
  tables?: readonly string[];
  /** Only these operations; every operation by default. */
  operations?: readonly AuditOperation[];
};

/** Which residents' events to read, by the units or facilities they are on. */
export type ActivityScope = {
  unitIds?: readonly string[];
  facilityIds?: readonly string[];
};

const ACTOR_EMBED =
  "actor:staff!audit_events_actor_id_fkey (id, first_name, last_name, credentials)";

// Written out in each call so supabase-js sees a literal and types the embedded actor and resident.
const eventsQuery = (supabase: Client) =>
  supabase
    .from("audit_events")
    .select(`*, ${ACTOR_EMBED}, resident:residents (id, first_name, last_name)`, {
      count: "exact",
    });

/** The same, joined inward so a filter on the resident's unit or facility excludes the event. */
const scopedEventsQuery = (supabase: Client) =>
  supabase
    .from("audit_events")
    .select(
      `*, ${ACTOR_EMBED}, resident:residents!inner (id, first_name, last_name, unit_id, facility_id)`,
      { count: "exact" },
    );

type EventsQuery = ReturnType<typeof eventsQuery> | ReturnType<typeof scopedEventsQuery>;

/** One resident's audit trail, newest first, optionally within a window or on some tables. */
export async function getAuditTrail(
  supabase: Client,
  residentId: string,
  { limit = AUDIT_TRAIL_LIMIT, ...filters }: { limit?: number } & AuditEventFilters = {},
): Promise<AuditTrail> {
  const { entries, count } = await loadEntries(
    supabase,
    newestFirst(applyFilters(eventsQuery(supabase).eq("resident_id", residentId), filters)).limit(
      limit,
    ),
    "the audit trail",
  );
  return { entries, total: count ?? entries.length };
}

/** The most recent events across every resident in the caller's scope, newest first. */
export async function listRecentActivity(
  supabase: Client,
  { limit = FEED_LIMIT }: { limit?: number } = {},
): Promise<ActivityEntry[]> {
  return (await listActivity(supabase, { limit })).entries;
}

/**
 * Recent events across the caller's scope, or across the units and facilities named, newest
 * first, with how many match in all. An empty unit or facility list means no residents, so no
 * events; leave both out for the whole scope.
 */
export async function listActivity(
  supabase: Client,
  {
    limit = FEED_LIMIT,
    scope,
    ...filters
  }: { limit?: number; scope?: ActivityScope } & AuditEventFilters = {},
): Promise<Activity> {
  const unitIds = scope?.unitIds;
  const facilityIds = scope?.facilityIds;
  if ((unitIds && unitIds.length === 0) || (facilityIds && facilityIds.length === 0)) {
    return { entries: [], total: 0 };
  }

  let query: EventsQuery;
  if (unitIds || facilityIds) {
    let scoped = scopedEventsQuery(supabase);
    if (unitIds) scoped = scoped.in("resident.unit_id", [...unitIds]);
    if (facilityIds) scoped = scoped.in("resident.facility_id", [...facilityIds]);
    query = scoped;
  } else {
    query = eventsQuery(supabase);
  }

  const { entries, count } = await loadEntries(
    supabase,
    newestFirst(applyFilters(query, filters)).limit(limit),
    "the activity feed",
  );
  return { entries, total: count ?? entries.length };
}

/** The events with these ids that the caller may see, newest first. */
export async function getActivityEntries(
  supabase: Client,
  ids: readonly string[],
): Promise<ActivityEntry[]> {
  if (ids.length === 0) return [];
  const { entries } = await loadEntries(
    supabase,
    newestFirst(eventsQuery(supabase).in("id", [...ids])),
    "the activity feed",
  );
  return entries;
}

function applyFilters<Query extends EventsQuery>(query: Query, filters: AuditEventFilters): Query {
  let refined = query;
  if (filters.since) refined = refined.gte("occurred_at", filters.since) as Query;
  if (filters.until) refined = refined.lt("occurred_at", filters.until) as Query;
  if (filters.tables) refined = refined.in("table_name", [...filters.tables]) as Query;
  if (filters.operations) refined = refined.in("operation", [...filters.operations]) as Query;
  return refined;
}

function newestFirst<Query extends EventsQuery>(query: Query): Query {
  return query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false }) as Query;
}

/** An event row as either query returns it: the columns, the actor, and the resident. */
type EventRow = Tables<"audit_events"> & { actor: AuditActor; resident: AuditEventResident };

async function loadEntries(
  supabase: Client,
  query: PromiseLike<{
    data: EventRow[] | null;
    count: number | null;
    error: { message: string } | null;
  }>,
  label: string,
): Promise<{ entries: ActivityEntry[]; count: number | null }> {
  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);

  const rows = (data ?? []).map((row) => ({
    event: {
      id: row.id,
      occurred_at: row.occurred_at,
      table_name: row.table_name,
      record_id: row.record_id,
      resident_id: row.resident_id,
      operation: row.operation,
      old_values: asValues(row.old_values),
      new_values: asValues(row.new_values),
      changed_columns: row.changed_columns,
      actor: row.actor,
    } satisfies AuditEvent,
    resident: row.resident
      ? {
          id: row.resident.id,
          first_name: row.resident.first_name,
          last_name: row.resident.last_name,
        }
      : null,
  }));

  const references = await resolveReferences(
    supabase,
    rows.map((row) => row.event),
  );
  return {
    entries: rows.map(({ event, resident }) => ({
      ...event,
      resident,
      story: describeAuditEvent(event, references),
    })),
    count,
  };
}

function asValues(value: unknown): AuditValues | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AuditValues)
    : null;
}

/** The ids the events refer to, by what they refer to. */
export function referencedIds(
  events: readonly AuditEvent[],
): Record<AuditReferenceKind, Set<string>> {
  const ids: Record<AuditReferenceKind, Set<string>> = {
    rooms: new Set(),
    units: new Set(),
    staff: new Set(),
    medicationOrders: new Set(),
  };
  for (const event of events) {
    if (!isAuditedTable(event.table_name)) continue;
    for (const values of [event.old_values, event.new_values]) {
      if (!values) continue;
      for (const [column, value] of Object.entries(values)) {
        const kind = referenceKind(event.table_name, column);
        if (kind && typeof value === "string") ids[kind].add(value);
      }
    }
  }
  return ids;
}

async function resolveReferences(
  supabase: Client,
  events: readonly AuditEvent[],
): Promise<AuditReferences> {
  const ids = referencedIds(events);
  const [rooms, units, staff, orders] = await Promise.all([
    lookup(ids.rooms, async (list) => {
      const { data, error } = await supabase.from("rooms").select("id, number").in("id", list);
      if (error) throw new Error(`Could not load rooms: ${error.message}`);
      return data.map((room) => [room.id, room.number]);
    }),
    lookup(ids.units, async (list) => {
      const { data, error } = await supabase.from("units").select("id, name").in("id", list);
      if (error) throw new Error(`Could not load units: ${error.message}`);
      return data.map((unit) => [unit.id, unit.name]);
    }),
    lookup(ids.staff, async (list) => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, credentials")
        .in("id", list);
      if (error) throw new Error(`Could not load staff: ${error.message}`);
      return data.map((member) => [
        member.id,
        `${member.first_name} ${member.last_name}${member.credentials ? `, ${member.credentials}` : ""}`,
      ]);
    }),
    lookup(ids.medicationOrders, async (list) => {
      const { data, error } = await supabase
        .from("medication_orders")
        .select("id, medication")
        .in("id", list);
      if (error) throw new Error(`Could not load medication orders: ${error.message}`);
      return data.map((order) => [order.id, order.medication]);
    }),
  ]);
  return { rooms, units, staff, medicationOrders: orders };
}

async function lookup(
  ids: Set<string>,
  fetch: (ids: string[]) => Promise<Array<[string, string]>>,
): Promise<Map<string, string>> {
  if (ids.size === 0) return new Map();
  return new Map(await fetch([...ids]));
}
