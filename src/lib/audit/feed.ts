import { formatStaffName } from "../format";
import { residentHref } from "../residents/record-tabs";

import type { AuditActor, AuditStory } from "./describe";

/**
 * The activity feed's view of an audit event: who did what to whom, when, and where to go.
 * Plain data, so the dashboard can render it on the server, send it to the browser, and add
 * to it as Realtime announces new events. The event's field-level changes stay on the
 * resident's audit trail; the feed is the headline.
 */

/** How many events the feed shows: the initial load, and the cap as live ones arrive. */
export const FEED_LIMIT = 40;

export type FeedEntry = {
  id: string;
  occurredAt: string;
  /** "Maria Alvarez, RN", or null when the actor is outside the reader's scope. */
  actor: string | null;
  /** The predicate after the actor's name: "recorded vitals". */
  summary: string;
  kind: AuditStory["kind"];
  recordLabel: string;
  resident: { id: string; name: string } | null;
  /** The resident's page, on the record's tab. */
  href: string;
};

/** An audit event as the loader in `events.ts` returns it, with its story told. */
export type DescribedEvent = {
  id: string;
  occurred_at: string;
  resident_id: string;
  actor: AuditActor;
  resident: { id: string; first_name: string; last_name: string } | null;
  story: AuditStory;
};

export function toFeedEntry(event: DescribedEvent): FeedEntry {
  return {
    id: event.id,
    occurredAt: event.occurred_at,
    actor: formatStaffName(event.actor),
    summary: event.story.summary,
    kind: event.story.kind,
    recordLabel: event.story.recordLabel,
    resident: event.resident
      ? { id: event.resident.id, name: `${event.resident.first_name} ${event.resident.last_name}` }
      : null,
    href: residentHref(event.resident_id, event.story.tab ?? undefined),
  };
}

/**
 * Where the resident's name goes in the sentence. Stories about the resident row say "the
 * resident" ("moved the resident to Room 214", "changed the resident's diet"), and the name
 * takes that place; every other story is about a record and gets "for <name>" at the end.
 */
export function splitSummary(summary: string): { before: string; after: string } {
  const at = summary.indexOf("the resident");
  if (at === -1) return { before: `${summary} for `, after: "" };
  return { before: summary.slice(0, at), after: summary.slice(at + "the resident".length) };
}

/**
 * The feed after new entries arrive: no duplicates (Realtime can announce an event the
 * initial load already had), newest first, at most `limit` entries.
 */
export function mergeFeedEntries(
  current: readonly FeedEntry[],
  incoming: readonly FeedEntry[],
  limit = FEED_LIMIT,
): FeedEntry[] {
  const byId = new Map<string, FeedEntry>();
  for (const entry of [...current, ...incoming]) byId.set(entry.id, entry);
  return [...byId.values()]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
}
