"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import { shiftAt } from "@/lib/clinical/shifts";
import { formatTime } from "@/lib/format";

/**
 * The shift at a glance in the sidebar: which shift, how much of it is left, and whose
 * residents are in view. Starts from the server's clock so the first render matches, then
 * ticks once a minute.
 */
export function ShiftCard({ serverNow, scope }: { serverNow: string; scope: string }) {
  const [now, setNow] = useState(() => new Date(serverNow));
  const { state, isMobile } = useSidebar();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const shift = shiftAt(now);
  const total = shift.endsAt.getTime() - shift.startsAt.getTime();
  const left = Math.max(0, shift.endsAt.getTime() - now.getTime());
  const elapsed = Math.min(100, Math.round(((total - left) / total) * 100));

  // Collapsed to icons, the card would be clipped; the header's scope line is enough.
  if (state === "collapsed" && !isMobile) return null;

  return (
    <section
      aria-label="Current shift"
      className="mx-2 rounded-lg border border-sidebar-border bg-sidebar-accent/60 p-3 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-sidebar-accent-foreground">{shift.name}</span>
        <span className="flex items-center gap-1 text-xs text-sidebar-muted-foreground">
          <Clock className="size-3" aria-hidden />
          {formatLeft(left)} left
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${shift.name} progress`}
        aria-valuenow={elapsed}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-sidebar"
      >
        <div className="h-full rounded-full bg-sidebar-primary" style={{ width: `${elapsed}%` }} />
      </div>
      <p className="mt-2 text-xs text-sidebar-muted-foreground">
        <time dateTime={shift.startsAt.toISOString()}>{formatTime(shift.startsAt)}</time> to{" "}
        <time dateTime={shift.endsAt.toISOString()}>{formatTime(shift.endsAt)}</time>
      </p>
      <p className="mt-1 text-xs leading-snug text-sidebar-foreground">{scope}</p>
    </section>
  );
}

function formatLeft(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
