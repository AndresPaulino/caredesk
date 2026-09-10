"use client";

import { Archive, History, Pencil, Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { AuditStoryKind } from "@/lib/audit/describe";
import { mergeFeedEntries, splitSummary, type FeedEntry } from "@/lib/audit/feed";
import { loadFeedEntries } from "@/lib/dashboard/actions";
import { formatTime } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import { dateInZone, dayHeading, groupByDay } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * The activity feed: who did what to whom, as it happens. The server renders the most recent
 * events; from then on the browser listens for inserts on audit_events over Supabase Realtime,
 * which applies the events policy per subscriber, so a nurse hears only about their units.
 * Each announced event is read back through the caller's session (`loadFeedEntries`) to be
 * told as a sentence with the names the policies allow, then prepended.
 */

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

/** Realtime can announce several events for one action; they are read back in one call. */
const BATCH_DELAY_MS = 200;

type Connection = "connecting" | "live" | "reconnecting";

const CONNECTION_LABELS: Readonly<Record<Connection, string>> = {
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
};

export function ActivityFeed({
  initial,
  today: initialToday,
  scopeDescription,
}: {
  initial: FeedEntry[];
  /** Today's calendar date in the facilities' time zone, for the day headings. */
  today: string;
  scopeDescription: string;
}) {
  const [entries, setEntries] = useState(initial);
  const [today, setToday] = useState(initialToday);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [connection, setConnection] = useState<Connection>("connecting");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const flush = async () => {
      timer = null;
      const ids = [...pending];
      pending.clear();
      const loaded = await loadFeedEntries(ids);
      if (disposed || loaded.length === 0) return;
      setToday(dateInZone(new Date()));
      setFresh((current) => new Set([...current, ...loaded.map((entry) => entry.id)]));
      setEntries((current) => mergeFeedEntries(current, loaded));
    };

    const channel = supabase
      .channel("activity-feed")
      .on<Tables<"audit_events">>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_events" },
        (payload) => {
          pending.add(payload.new.id);
          timer ??= setTimeout(() => void flush(), BATCH_DELAY_MS);
        },
      );

    // Subscribing with the session token in hand, rather than as the anonymous key, is what
    // makes the policy apply: without it the subscriber would simply hear nothing.
    void supabase.auth.getSession().then(({ data }) => {
      if (disposed) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        if (disposed) return;
        setConnection(
          status === "SUBSCRIBED"
            ? "live"
            : status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "reconnecting"
              : "connecting",
        );
      });
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const days = groupByDay(entries, (entry) => entry.occurredAt);

  return (
    <Card className="@container/feed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Activity
        </CardTitle>
        <CardDescription>
          Changes to resident records as they happen. {scopeDescription}.
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <ConnectionBadge connection={connection} />
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <Empty className="border-0 py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Nothing has changed yet</EmptyTitle>
              <EmptyDescription>
                Changes made by staff to residents in your scope appear here the moment they are
                saved.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="-mx-1 max-h-[36rem] space-y-5 overflow-y-auto px-1 @xl/feed:max-h-[44rem]">
            {days.map(({ date, items }) => (
              <li key={date}>
                <h3 className="sticky top-0 z-10 -mx-1 mb-2 bg-card px-1 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {dayHeading(date, today)}
                </h3>
                <ol className="space-y-1">
                  {items.map((entry) => (
                    <FeedItem key={entry.id} entry={entry} fresh={fresh.has(entry.id)} />
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function FeedItem({ entry, fresh }: { entry: FeedEntry; fresh: boolean }) {
  const Icon = ICONS[entry.kind];
  const sentence = splitSummary(entry.summary);
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg px-2 py-2",
        fresh && "animate-in bg-muted/60 duration-500 fade-in slide-in-from-top-1",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border bg-card",
          TONES[entry.kind],
        )}
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{entry.actor ?? "A staff member outside your scope"}</span>{" "}
          {entry.resident ? (
            <>
              {sentence.before}
              <Link href={entry.href} className="font-medium underline-offset-4 hover:underline">
                {entry.resident.name}
              </Link>
              {sentence.after}
            </>
          ) : (
            entry.summary
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <time dateTime={entry.occurredAt} className="tabular-nums">
            {formatTime(entry.occurredAt)}
          </time>
          {" · "}
          {entry.recordLabel}
        </p>
      </div>
    </li>
  );
}

function ConnectionBadge({ connection }: { connection: Connection }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          "size-2 rounded-full",
          connection === "live" ? "bg-[#0ca30c]" : "bg-muted-foreground/50",
          connection === "connecting" && "animate-pulse",
        )}
        aria-hidden
      />
      {CONNECTION_LABELS[connection]}
    </span>
  );
}
