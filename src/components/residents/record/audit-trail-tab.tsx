import { Archive, ChevronDown, History, Pencil, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import type { AuditTrail } from "@/lib/audit/events";
import type { AuditChange, AuditStoryKind, AuditTrailEntry } from "@/lib/audit/describe";
import { formatStaffName, formatTime } from "@/lib/format";
import { RECORD_TABS, residentHref } from "@/lib/residents/record-tabs";
import { dayHeading, groupByDay } from "@/lib/time";
import { cn } from "@/lib/utils";

import { RecordEmpty, RecordPanel } from "./record-panel";

/** Events shown before the rest fold behind "older changes". */
const INITIAL_ENTRIES = 25;

const ICONS: Readonly<Record<AuditStoryKind, LucideIcon>> = {
  added: Plus,
  changed: Pencil,
  removed: Archive,
};

const TONES: Readonly<Record<AuditStoryKind, string>> = {
  added: "text-muted-foreground",
  changed: "text-muted-foreground",
  removed: "border-destructive/40 text-destructive",
};

/**
 * The audit trail: every change to this resident's record, newest first, as a story of who
 * did what. Each event opens to a field-by-field view of the values before and after.
 */
export function AuditTrailTab({
  residentId,
  trail,
  today,
}: {
  residentId: string;
  trail: AuditTrail;
  today: string;
}) {
  const recent = trail.entries.slice(0, INITIAL_ENTRIES);
  const older = trail.entries.slice(INITIAL_ENTRIES);

  return (
    <RecordPanel
      title="Audit trail"
      description="Every change to this resident's record, newest first: who made it, when, and what changed."
    >
      {trail.entries.length === 0 ? (
        <RecordEmpty
          icon={History}
          title="No changes recorded"
          description="Changes made to this resident's record from this page or by other staff appear here as they happen."
        />
      ) : (
        <>
          <AuditList residentId={residentId} entries={recent} today={today} />
          {older.length > 0 && (
            <details className="group mt-4">
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                <span className="group-open:hidden">Show {older.length} older changes</span>
                <span className="hidden group-open:inline">Hide older changes</span>
              </summary>
              <div className="mt-4">
                <AuditList residentId={residentId} entries={older} today={today} />
              </div>
            </details>
          )}
          {trail.total > trail.entries.length && (
            <p className="text-xs text-muted-foreground">
              Showing the {trail.entries.length} most recent of {trail.total} changes.
            </p>
          )}
        </>
      )}
    </RecordPanel>
  );
}

function AuditList({
  residentId,
  entries,
  today,
}: {
  residentId: string;
  entries: AuditTrailEntry[];
  today: string;
}) {
  const days = groupByDay(entries, (entry) => entry.occurred_at);

  return (
    <ol className="space-y-6">
      {days.map(({ date, items }) => (
        <li key={date}>
          <h3 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {dayHeading(date, today)}
          </h3>
          <ol className="space-y-2">
            {items.map((entry) => (
              <AuditEventItem key={entry.id} residentId={residentId} entry={entry} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function AuditEventItem({ residentId, entry }: { residentId: string; entry: AuditTrailEntry }) {
  const { story } = entry;
  const Icon = ICONS[story.kind];
  const tab = story.tab ? RECORD_TABS.find((candidate) => candidate.key === story.tab) : null;
  const actor = formatStaffName(entry.actor) ?? "A staff member outside your scope";

  return (
    <li>
      <details className="group/event rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
              TONES[story.kind],
            )}
            aria-hidden
          >
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{actor}</span> {story.summary}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              <time dateTime={entry.occurred_at} className="tabular-nums">
                {formatTime(entry.occurred_at)}
              </time>
              {" · "}
              {story.recordLabel}
            </p>
          </div>
          <ChevronDown
            className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open/event:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="border-t px-4 py-3">
          {story.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No field values to show.</p>
          ) : (
            <ChangesTable changes={story.changes} operation={entry.operation} />
          )}
          {tab && (
            <p className="mt-3 text-xs text-muted-foreground">
              <Link
                href={residentHref(residentId, tab.key)}
                scroll={false}
                className="underline underline-offset-3 hover:text-foreground"
              >
                Open {tab.label.toLowerCase()}
              </Link>
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

/** Before and after for an update; the recorded values for an addition or a removal. */
function ChangesTable({
  changes,
  operation,
}: {
  changes: AuditChange[];
  operation: AuditTrailEntry["operation"];
}) {
  const twoSided = operation === "update";
  const valueHeading = operation === "delete" ? "Value before" : "Value";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="pr-4 pb-1.5 font-medium">
              Field
            </th>
            {twoSided ? (
              <>
                <th scope="col" className="pr-4 pb-1.5 font-medium">
                  Before
                </th>
                <th scope="col" className="pb-1.5 font-medium">
                  After
                </th>
              </>
            ) : (
              <th scope="col" className="pb-1.5 font-medium">
                {valueHeading}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.column} className="border-t align-top">
              <th
                scope="row"
                className="py-1.5 pr-4 text-left font-normal whitespace-nowrap text-muted-foreground"
              >
                {change.label}
              </th>
              {twoSided ? (
                <>
                  <td className="py-1.5 pr-4">
                    <Value>{change.before}</Value>
                  </td>
                  <td className="py-1.5 font-medium">
                    <Value>{change.after}</Value>
                  </td>
                </>
              ) : (
                <td className="py-1.5">
                  <Value>{operation === "delete" ? change.before : change.after}</Value>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Value({ children }: { children: string | null }) {
  if (children === null || children === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="block max-w-prose min-w-24 whitespace-pre-line">{children}</span>;
}
