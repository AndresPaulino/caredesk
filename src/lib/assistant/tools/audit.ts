import "server-only";

import { getAuditTrail, listActivity, type ActivityEntry } from "@/lib/audit/events";
import type { AuditOperation, AuditTrailEntry } from "@/lib/audit/describe";
import { formatStaffName } from "@/lib/format";
import { getResident } from "@/lib/residents/queries";
import type { RecordTabKey } from "@/lib/residents/record-tabs";

import { ASSISTANT_ACCESS_TABLE } from "../access";

import {
  calendar,
  instantFrom,
  resolveScope,
  sourceFor,
  type ScopeInput,
  type ScopeSummary,
  type SourceRef,
  type ToolContext,
} from "./shared";

/**
 * The audit tools: one resident's audit trail, and recent activity across a unit, a facility,
 * or the caller's whole scope. Both read the same events the audit trail tab and the activity
 * feed show, told as the same sentences, so "who updated his medications yesterday" is
 * answered with the name the trail records. Assistant access events (the trail's record of
 * questions and lookups, this one included) are left out unless asked for, so "what changed"
 * is about the records.
 */

export const AUDIT_EVENTS_LIMIT = 25;
export const AUDIT_EVENTS_MAX_LIMIT = 100;

/** The record types the model can filter by; each is one or more tracked tables. */
export const AUDIT_RECORD_TYPES = [
  "resident",
  "conditions",
  "allergies",
  "medications",
  "vitals",
  "assessments",
  "labs",
  "care-plan",
  "incidents",
  "notes",
  "appointments",
  "family",
  "assistant",
] as const;

export type AuditRecordType = (typeof AUDIT_RECORD_TYPES)[number];

const TABLES_BY_RECORD_TYPE: Readonly<Record<AuditRecordType, readonly string[]>> = {
  resident: ["residents"],
  conditions: ["conditions"],
  allergies: ["allergies"],
  medications: ["medication_orders", "administrations"],
  vitals: ["vitals"],
  assessments: ["assessments"],
  labs: ["lab_results"],
  "care-plan": ["care_plans", "care_plan_goals"],
  incidents: ["incidents"],
  notes: ["progress_notes"],
  appointments: ["appointments"],
  family: ["family_contacts"],
  assistant: [ASSISTANT_ACCESS_TABLE],
};

const CHANGE_OPERATIONS: readonly AuditOperation[] = ["insert", "update", "delete"];

export type AuditWindow = {
  /** Only events at or after this date or instant. */
  since?: string;
  /** Only events before this instant, or through the end of this date. */
  until?: string;
  /** Only these record types; every type by default. */
  recordTypes?: AuditRecordType[];
  /** Also return assistant questions and lookups; left out by default. */
  includeAssistantAccess?: boolean;
  limit?: number;
};

export type AuditEventSummary = {
  id: string;
  occurredAt: string;
  occurredOn: string;
  daysAgo: number;
  /** "Maria Alvarez, RN", or null when the actor is outside the caller's scope. */
  actor: string | null;
  /** What the actor did, as a predicate: "discontinued the Metformin order". */
  summary: string;
  recordType: string;
  recordId: string;
  /** The record tab holding the record, or null. */
  tab: RecordTabKey | null;
  /** Field by field: what was recorded, or what changed from and to. */
  changes: Array<{ field: string; before: string | null; after: string | null }>;
};

export type AuditTrailToolResult = {
  source: SourceRef;
  /** Newest first, at most `limit` of `total`. */
  events: AuditEventSummary[];
  total: number;
};

/** One resident's audit trail, newest first. Null when no resident is visible. */
export async function getAuditTrailForAssistant(
  { supabase, now }: ToolContext,
  { residentId, ...window }: { residentId: string } & AuditWindow,
): Promise<AuditTrailToolResult | null> {
  const resident = await getResident(supabase, residentId);
  if (!resident) return null;

  const trail = await getAuditTrail(supabase, residentId, filtersFor(window));
  return {
    source: sourceFor(resident, "audit"),
    events: trail.entries.map((entry) => summarizeEvent(entry, now)),
    total: trail.total,
  };
}

export type RecentActivityResult = {
  scope: ScopeSummary;
  /** The residents the activity concerned, one chip each, in the order they appear. */
  sources: SourceRef[];
  /** Newest first, at most `limit` of `total`. */
  activity: Array<AuditEventSummary & { resident: { id: string; name: string } | null }>;
  total: number;
};

/** Recent events across a unit, a facility, or the caller's whole scope, newest first. */
export async function getRecentActivity(
  { supabase, now }: ToolContext,
  { unit, facility, ...window }: ScopeInput & AuditWindow,
): Promise<RecentActivityResult> {
  const scope = await resolveScope(supabase, { unit, facility });
  const activity = await listActivity(supabase, {
    ...filtersFor(window),
    scope: { unitIds: scope.unitIds ?? undefined, facilityIds: scope.facilityIds ?? undefined },
  });

  const sources: SourceRef[] = [];
  for (const entry of activity.entries) {
    if (!entry.resident || sources.some((source) => source.residentId === entry.resident?.id)) {
      continue;
    }
    sources.push({
      residentId: entry.resident.id,
      residentName: `${entry.resident.first_name} ${entry.resident.last_name}`,
      tab: "audit",
    });
  }

  return {
    scope: { description: scope.description, units: scope.units, facilities: scope.facilities },
    sources,
    activity: activity.entries.map((entry) => ({
      ...summarizeEvent(entry, now),
      resident: residentOf(entry),
    })),
    total: activity.total,
  };
}

function filtersFor({
  since,
  until,
  recordTypes,
  includeAssistantAccess,
  limit = AUDIT_EVENTS_LIMIT,
}: AuditWindow) {
  const includeAccess = includeAssistantAccess || recordTypes?.includes("assistant");
  return {
    limit: Math.min(Math.max(1, limit), AUDIT_EVENTS_MAX_LIMIT),
    since: instantFrom(since, "since"),
    until: instantFrom(until, "until"),
    tables:
      recordTypes && recordTypes.length > 0
        ? [...new Set(recordTypes.flatMap((type) => TABLES_BY_RECORD_TYPE[type]))]
        : undefined,
    operations: includeAccess ? undefined : CHANGE_OPERATIONS,
  };
}

function summarizeEvent(entry: AuditTrailEntry, now: Date): AuditEventSummary {
  const { on, daysAgo } = calendar(entry.occurred_at, now);
  return {
    id: entry.id,
    occurredAt: entry.occurred_at,
    occurredOn: on,
    daysAgo,
    actor: formatStaffName(entry.actor),
    summary: entry.story.summary,
    recordType: entry.story.recordLabel,
    recordId: entry.record_id,
    tab: entry.story.tab,
    changes: entry.story.changes.map((change) => ({
      field: change.label,
      before: change.before,
      after: change.after,
    })),
  };
}

function residentOf(entry: ActivityEntry): { id: string; name: string } | null {
  return entry.resident
    ? { id: entry.resident.id, name: `${entry.resident.first_name} ${entry.resident.last_name}` }
    : null;
}
