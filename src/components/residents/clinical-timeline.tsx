import { FlaskConical, History, NotebookPen, Stethoscope, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TIMELINE_TYPE_LABELS,
  type TimelineEntry,
  type TimelineEntryType,
} from "@/lib/clinical/timeline";
import { formatTime } from "@/lib/format";
import { RECORD_TABS, residentHref } from "@/lib/residents/record-tabs";
import { dayHeading, groupByDay } from "@/lib/time";
import { cn } from "@/lib/utils";

/** Entries shown before the rest fold behind "older entries". */
const INITIAL_ENTRIES = 20;

const ICONS: Readonly<Record<TimelineEntryType, LucideIcon>> = {
  assessment: Stethoscope,
  lab_results: FlaskConical,
  incident: TriangleAlert,
  progress_note: NotebookPen,
};

/**
 * The resident's recent story, top to bottom: assessments, lab results, incidents, and
 * progress notes in one list, newest first, grouped by day.
 */
export function ClinicalTimeline({
  residentId,
  entries,
  today,
}: {
  residentId: string;
  entries: TimelineEntry[];
  today: string;
}) {
  const recent = entries.slice(0, INITIAL_ENTRIES);
  const older = entries.slice(INITIAL_ENTRIES);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Clinical timeline
        </CardTitle>
        <CardDescription>
          Assessments, lab results, incidents, and progress notes, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing on the timeline yet.</p>
        ) : (
          <>
            <TimelineList residentId={residentId} entries={recent} today={today} />
            {older.length > 0 && (
              <details className="group mt-4">
                <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                  <span className="group-open:hidden">Show {older.length} older entries</span>
                  <span className="hidden group-open:inline">Hide older entries</span>
                </summary>
                <div className="mt-4">
                  <TimelineList residentId={residentId} entries={older} today={today} />
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineList({
  residentId,
  entries,
  today,
}: {
  residentId: string;
  entries: TimelineEntry[];
  today: string;
}) {
  const days = groupByDay(entries, (entry) => entry.at);

  return (
    <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
      {days.map(({ date, items: dayEntries }) => (
        <li key={date}>
          <h3 className="relative mb-3 ml-9 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {dayHeading(date, today)}
          </h3>
          <ol className="space-y-5">
            {dayEntries.map((entry) => (
              <TimelineItem key={entry.id} residentId={residentId} entry={entry} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function TimelineItem({ residentId, entry }: { residentId: string; entry: TimelineEntry }) {
  const Icon = ICONS[entry.type];
  const tab = entry.tab ? RECORD_TABS.find((candidate) => candidate.key === entry.tab) : null;

  return (
    <li className="relative pl-9">
      <span
        className={cn(
          "absolute top-0 left-0 flex size-6 items-center justify-center rounded-full border bg-card",
          entry.attention ? "border-destructive/40 text-destructive" : "text-muted-foreground",
        )}
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {TIMELINE_TYPE_LABELS[entry.type] !== entry.title && (
          <span className="text-xs font-medium text-muted-foreground">
            {TIMELINE_TYPE_LABELS[entry.type]}
          </span>
        )}
        <span className="text-sm font-medium">{entry.title}</span>
        <time dateTime={entry.at} className="ml-auto text-xs text-muted-foreground tabular-nums">
          {formatTime(entry.at)}
        </time>
      </div>
      {entry.detail && (
        <p className="mt-1 line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">
          {entry.detail}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {entry.staff ?? "No staff member recorded"}
        {tab && (
          <>
            {" · "}
            <Link
              href={residentHref(residentId, tab.key)}
              scroll={false}
              className="underline underline-offset-3 hover:text-foreground"
            >
              Open {tab.label.toLowerCase()}
            </Link>
          </>
        )}
      </p>
    </li>
  );
}
