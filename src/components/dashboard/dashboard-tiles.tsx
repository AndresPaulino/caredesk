import {
  Activity,
  BedDouble,
  CalendarClock,
  ClipboardCheck,
  Pill,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { describeShift, type ShiftWindow } from "@/lib/clinical/shifts";
import { formatOccupancy } from "@/lib/dashboard/occupancy";
import type { DashboardTiles as Tiles } from "@/lib/dashboard/queries";
import { DEFAULT_RESIDENT_LIST_PARAMS, residentListHref } from "@/lib/residents/list-params";
import type { ResidentFocusKey } from "@/lib/residents/focus";
import { cn } from "@/lib/utils";

/**
 * The six tiles. Each number is a set of residents: the whole card links to the resident
 * list with the matching focus, so the count becomes people to act on. Started from the
 * stat cards of the shadcn dashboard block (ADR 0004) and cut down to a label, a number, an
 * icon, and a footer line.
 */
export function DashboardTiles({ tiles, shift }: { tiles: Tiles; shift: ShiftWindow }) {
  const focus = (key: ResidentFocusKey) =>
    residentListHref(DEFAULT_RESIDENT_LIST_PARAMS, { focus: key });
  const occupancy = tiles.beds > 0 ? tiles.residents / tiles.beds : 0;
  const appointments = tiles.appointmentsToday + tiles.appointmentsTomorrow;

  return (
    <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-3">
      <Tile
        label="Census"
        value={tiles.residents}
        unit={plural(tiles.residents, "resident")}
        icon={BedDouble}
        href="/residents"
        footer={`${tiles.beds} beds, ${formatOccupancy(occupancy)} occupied`}
      />
      <Tile
        label="Medications due this shift"
        value={tiles.medicationDue}
        unit={plural(tiles.medicationDue, "resident")}
        icon={Pill}
        href={focus("medications-due")}
        footer={describeShift(shift)}
        aside={
          <Link href={focus("medications-overdue")} className="relative z-10">
            <Badge variant={tiles.medicationOverdue > 0 ? "destructive" : "outline"}>
              {tiles.medicationOverdue > 0 && <TriangleAlert aria-hidden />}
              {tiles.medicationOverdue} overdue
            </Badge>
          </Link>
        }
      />
      <Tile
        label="Overdue assessments"
        value={tiles.overdueAssessment}
        unit={plural(tiles.overdueAssessment, "resident")}
        icon={ClipboardCheck}
        href={focus("overdue-assessments")}
        footer="Any kind past its due interval, or never done"
        attention={tiles.overdueAssessment > 0}
      />
      <Tile
        label="Out-of-range vitals"
        value={tiles.outOfRangeVitals}
        unit={plural(tiles.outOfRangeVitals, "resident")}
        icon={Activity}
        href={focus("out-of-range-vitals")}
        footer="A reading outside its normal range in the last 24 hours"
        attention={tiles.outOfRangeVitals > 0}
      />
      <Tile
        label="Incidents in the last 7 days"
        value={tiles.incidents}
        unit={plural(tiles.incidents, "incident")}
        icon={TriangleAlert}
        href={focus("recent-incidents")}
        footer={`${tiles.incidentResidents} ${plural(tiles.incidentResidents, "resident")} involved`}
        attention={tiles.incidents > 0}
      />
      <Tile
        label="Appointments today and tomorrow"
        value={appointments}
        unit={plural(appointments, "appointment")}
        icon={CalendarClock}
        href={focus("upcoming-appointments")}
        footer={`${tiles.appointmentsToday} today, ${tiles.appointmentsTomorrow} tomorrow, ${tiles.appointmentResidents} ${plural(tiles.appointmentResidents, "resident")}`}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  icon: Icon,
  href,
  footer,
  aside,
  attention = false,
}: {
  label: string;
  value: number;
  unit: string;
  icon: LucideIcon;
  /** Where the whole card goes: the resident list, focused on these residents. */
  href: string;
  footer: string;
  /** A second figure with its own link, kept above the card's link. */
  aside?: React.ReactNode;
  /** Colors the icon when the number wants a look. Never color alone: the label says why. */
  attention?: boolean;
}) {
  return (
    <Card className="@container/card relative transition-colors has-[a:hover]:ring-foreground/25">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-xl">
            {value.toLocaleString("en-US")}
          </Link>
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span>
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          {aside}
          <Icon
            className={cn("size-4", attention ? "text-destructive" : "text-muted-foreground")}
            aria-hidden
          />
        </CardAction>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">
        <p className="line-clamp-2">{footer}</p>
      </CardFooter>
    </Card>
  );
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
