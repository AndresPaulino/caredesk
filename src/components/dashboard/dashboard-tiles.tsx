import {
  Activity,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  Pill,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { describeShift, type ShiftWindow } from "@/lib/clinical/shifts";
import type { DashboardTiles as Tiles } from "@/lib/dashboard/queries";
import { DEFAULT_RESIDENT_LIST_PARAMS, residentListHref } from "@/lib/residents/list-params";
import type { ResidentFocusKey } from "@/lib/residents/focus";
import { cn } from "@/lib/utils";

/**
 * The shift board. Each number is a set of residents: the whole tile links to the resident
 * list with the matching focus, so the count becomes people to act on. Tiles with something
 * to do come first and carry status colour (ADR 0005); a tile whose count is zero drops into
 * the all-clear line instead of taking a slot.
 */

type Tone = "critical" | "attention" | "neutral";

type TileSpec = {
  key: string;
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
  href: string;
  footer: string;
  tone: Tone;
  /** Shown in the all-clear line when the count is zero. */
  clearLabel: string;
  /** Always a tile, even at zero: appointments are planning, not a problem. */
  alwaysShown?: boolean;
  aside?: React.ReactNode;
};

const TONE_ORDER: Record<Tone, number> = { critical: 0, attention: 1, neutral: 2 };

export function DashboardTiles({ tiles, shift }: { tiles: Tiles; shift: ShiftWindow }) {
  const focus = (key: ResidentFocusKey) =>
    residentListHref(DEFAULT_RESIDENT_LIST_PARAMS, { focus: key });
  const appointments = tiles.appointmentsToday + tiles.appointmentsTomorrow;

  const specs: TileSpec[] = [
    {
      key: "medications",
      label: "Medications due this shift",
      value: tiles.medicationDue,
      unit: plural(tiles.medicationDue, "resident"),
      icon: Pill,
      href: focus("medications-due"),
      footer: describeShift(shift),
      tone: tiles.medicationOverdue > 0 ? "critical" : "attention",
      clearLabel: "no medications due",
      aside:
        tiles.medicationOverdue > 0 ? (
          <Link
            href={focus("medications-overdue")}
            className="relative z-10 inline-flex items-center gap-1 rounded-full bg-critical-soft px-2 py-0.5 text-xs font-semibold text-critical hover:underline"
          >
            <TriangleAlert className="size-3" aria-hidden />
            {tiles.medicationOverdue} overdue
          </Link>
        ) : undefined,
    },
    {
      key: "assessments",
      label: "Overdue assessments",
      value: tiles.overdueAssessment,
      unit: plural(tiles.overdueAssessment, "resident"),
      icon: ClipboardCheck,
      href: focus("overdue-assessments"),
      footer: "Any kind past its due interval, or never done",
      tone: "critical",
      clearLabel: "no overdue assessments",
    },
    {
      key: "vitals",
      label: "Out-of-range vitals",
      value: tiles.outOfRangeVitals,
      unit: plural(tiles.outOfRangeVitals, "resident"),
      icon: Activity,
      href: focus("out-of-range-vitals"),
      footer: "A reading outside its normal range in the last 24 hours",
      tone: "critical",
      clearLabel: "no out-of-range vitals",
    },
    {
      key: "incidents",
      label: "Incidents in the last 7 days",
      value: tiles.incidents,
      unit: plural(tiles.incidents, "incident"),
      icon: TriangleAlert,
      href: focus("recent-incidents"),
      footer: `${tiles.incidentResidents} ${plural(tiles.incidentResidents, "resident")} involved`,
      tone: "attention",
      clearLabel: "no incidents this week",
    },
    {
      key: "appointments",
      label: "Appointments today and tomorrow",
      value: appointments,
      unit: plural(appointments, "appointment"),
      icon: CalendarClock,
      href: focus("upcoming-appointments"),
      footer: `${tiles.appointmentsToday} today, ${tiles.appointmentsTomorrow} tomorrow, ${tiles.appointmentResidents} ${plural(tiles.appointmentResidents, "resident")}`,
      tone: "neutral",
      clearLabel: "no appointments",
      alwaysShown: true,
    },
  ];

  const shown = specs
    .filter((spec) => spec.value > 0 || spec.alwaysShown)
    .toSorted((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  const clear = specs.filter((spec) => spec.value === 0 && !spec.alwaysShown);

  return (
    <section aria-labelledby="shift-board-title" className="space-y-3">
      <h2 id="shift-board-title" className="text-lg font-semibold">
        Needs attention
      </h2>
      <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-3">
        {shown.map(({ key, ...spec }, index) => (
          <Tile
            key={key}
            {...spec}
            // In two columns, an odd last tile spans the row instead of leaving a hole.
            className={
              shown.length % 2 === 1 && index === shown.length - 1
                ? "@md/main:col-span-2 @3xl/main:col-span-1"
                : undefined
            }
          />
        ))}
      </div>
      {clear.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>All clear: {joinList(clear.map((spec) => spec.clearLabel))}.</span>
        </p>
      )}
    </section>
  );
}

const TONE_STYLES: Record<Tone, { band: string; icon: string }> = {
  critical: { band: "bg-critical", icon: "bg-critical-soft text-critical" },
  attention: { band: "bg-attention", icon: "bg-attention-soft text-attention" },
  neutral: { band: "bg-transparent", icon: "bg-willow-50 text-willow-600" },
};

function Tile({
  label,
  value,
  unit,
  icon: Icon,
  href,
  footer,
  tone,
  aside,
  className,
}: Omit<TileSpec, "key" | "clearLabel" | "alwaysShown"> & { className?: string }) {
  const style = TONE_STYLES[tone];
  return (
    <article
      className={cn(
        "relative flex items-start gap-3.5 overflow-hidden rounded-xl bg-card p-4 pl-5 ring-1 ring-foreground/10 transition-shadow has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:hover]:shadow-md",
        className,
      )}
      data-tone={tone}
    >
      {/* The band, like the flag chips: the tile's status before its words are read. */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", style.band)} />
      <span
        aria-hidden
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", style.icon)}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex items-baseline gap-1.5">
            <Link
              href={href}
              className="text-3xl leading-none font-bold tracking-tight tabular-nums outline-none after:absolute after:inset-0"
            >
              {value.toLocaleString("en-US")}
            </Link>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </p>
          {aside}
        </div>
        <h3 className="mt-1.5 font-medium">{label}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{footer}</p>
      </div>
    </article>
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
