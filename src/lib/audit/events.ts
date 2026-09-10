import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../supabase/database.types";

import {
  isAuditedTable,
  referenceKind,
  type AuditReferenceKind,
  type AuditReferences,
} from "./columns";
import {
  describeAuditEvent,
  type AuditEvent,
  type AuditTrailEntry,
  type AuditValues,
} from "./describe";
import { FEED_LIMIT } from "./feed";

/**
 * Audit events read through the caller's session and told as a story. The events policy is
 * the resident's own scope (ADR 0003), so a resident outside scope has no events, the same as
 * one who does not exist. The actor, the resident, and the names behind foreign keys (rooms,
 * units, staff, medication orders) are read through their own policies; a name outside the
 * caller's scope comes back missing and is shown as such.
 *
 * Three readers share one loader: the audit trail on a resident's page, the activity feed on
 * the dashboard (the most recent events across the caller's whole scope), and the feed's
 * live updates (events by id, as Realtime announces them).
 */

type Client = SupabaseClient<Database>;

export type AuditEventResident = { id: string; first_name: string; last_name: string } | null;

/** A trail entry that also names the resident it belongs to, for readers spanning residents. */
export type ActivityEntry = AuditTrailEntry & { resident: AuditEventResident };

export type AuditTrail = {
  /** Newest first, at most `limit` of them. */
  entries: AuditTrailEntry[];
  /** How many events the resident has in all. */
  total: number;
};

export const AUDIT_TRAIL_LIMIT = 200;

// Written out in the call so supabase-js sees a literal and types the embedded actor and resident.
const eventsQuery = (supabase: Client, options: { count?: "exact" } = {}) =>
  supabase.from("audit_events").select(
    `*, actor:staff!audit_events_actor_id_fkey (id, first_name, last_name, credentials),
       resident:residents!audit_events_resident_id_fkey (id, first_name, last_name)`,
    options,
  );

type EventsQuery = ReturnType<typeof eventsQuery>;

const newestFirst = (query: EventsQuery) =>
  query.order("occurred_at", { ascending: false }).order("id", { ascending: false });

/** One resident's audit trail, newest first. */
export async function getAuditTrail(
  supabase: Client,
  residentId: string,
  { limit = AUDIT_TRAIL_LIMIT }: { limit?: number } = {},
): Promise<AuditTrail> {
  const { entries, count } = await loadEntries(
    supabase,
    eventsQuery(supabase, { count: "exact" }).eq("resident_id", residentId),
    (query) => newestFirst(query).limit(limit),
    "the audit trail",
  );
  return { entries, total: count ?? entries.length };
}

/** The most recent events across every resident in the caller's scope, newest first. */
export async function listRecentActivity(
  supabase: Client,
  { limit = FEED_LIMIT }: { limit?: number } = {},
): Promise<ActivityEntry[]> {
  const { entries } = await loadEntries(
    supabase,
    eventsQuery(supabase),
    (query) => newestFirst(query).limit(limit),
    "the activity feed",
  );
  return entries;
}

/** The events with these ids that the caller may see, newest first. */
export async function getActivityEntries(
  supabase: Client,
  ids: readonly string[],
): Promise<ActivityEntry[]> {
  if (ids.length === 0) return [];
  const { entries } = await loadEntries(
    supabase,
    eventsQuery(supabase).in("id", [...ids]),
    (query) => newestFirst(query),
    "the activity feed",
  );
  return entries;
}

async function loadEntries(
  supabase: Client,
  base: EventsQuery,
  refine: (query: EventsQuery) => EventsQuery,
  label: string,
): Promise<{ entries: ActivityEntry[]; count: number | null }> {
  const { data, count, error } = await refine(base);
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
    resident: row.resident,
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
