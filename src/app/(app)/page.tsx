import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { DashboardTiles } from "@/components/dashboard/dashboard-tiles";
import { OccupancyChart } from "@/components/dashboard/occupancy-chart";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listRecentActivity } from "@/lib/audit/events";
import { toFeedEntry } from "@/lib/audit/feed";
import { requireStaff, type CurrentStaff } from "@/lib/auth/current-staff";
import { describeShift, shiftAt } from "@/lib/clinical/shifts";
import { formatOccupancy, groupOccupancy } from "@/lib/dashboard/occupancy";
import { getDashboardTiles, listUnitOccupancy } from "@/lib/dashboard/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DEMO_TIME_ZONE } from "@/lib/format";
import { dateInZone } from "@/lib/time";

/**
 * The dashboard: six tiles, census and occupancy by facility, and the live activity feed,
 * every number within the signed-in staff member's scope. The header renders at once; the
 * tiles and the feed stream in behind it, each reading through the caller's session.
 */
export default async function DashboardPage() {
  const staff = await requireStaff();
  const asOf = new Date();
  const shift = shiftAt(asOf);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting(asOf)}, ${staff.firstName}`}
        description={`${describeShift(shift)}. ${staff.scopeDescription}.`}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="@container/main space-y-6">
          <Suspense fallback={<TilesSkeleton />}>
            <Tiles staff={staff} asOf={asOf} />
          </Suspense>
        </div>
        <Suspense fallback={<FeedSkeleton />}>
          <Feed staff={staff} asOf={asOf} />
        </Suspense>
      </div>
    </div>
  );
}

async function Tiles({ staff, asOf }: { staff: CurrentStaff; asOf: Date }) {
  const supabase = await createSupabaseServerClient();
  const [tiles, occupancy] = await Promise.all([
    getDashboardTiles(supabase, asOf),
    listUnitOccupancy(supabase),
  ]);
  // An admin compares facilities; a nurse's scope is one facility, so they compare units.
  const byFacility = staff.role === "admin";
  const groups = groupOccupancy(occupancy, byFacility ? "facility" : "unit");

  return (
    <>
      <DashboardTiles tiles={tiles} shift={shiftAt(asOf)} />
      <Card>
        <CardHeader>
          <CardTitle>Census</CardTitle>
          <CardDescription>
            Current residents and free beds{byFacility ? " at each facility" : " on each unit"}.
          </CardDescription>
          <CardAction className="text-right">
            <Link href="/residents" className="text-2xl font-bold tabular-nums hover:underline">
              {tiles.residents.toLocaleString("en-US")}
            </Link>
            <p className="text-xs text-muted-foreground">
              of {tiles.beds.toLocaleString("en-US")} beds,{" "}
              {formatOccupancy(tiles.beds > 0 ? tiles.residents / tiles.beds : 0)} occupied
            </p>
          </CardAction>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No units are in your scope.</p>
          ) : (
            <OccupancyChart groups={groups} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

async function Feed({ staff, asOf }: { staff: CurrentStaff; asOf: Date }) {
  const supabase = await createSupabaseServerClient();
  const recent = await listRecentActivity(supabase);
  return (
    <ActivityFeed
      initial={recent.map(toFeedEntry)}
      today={dateInZone(asOf)}
      scopeDescription={staff.scopeDescription}
    />
  );
}

/** "Good morning" by the facilities' clock, not the server's. */
function greeting(instant: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: DEMO_TIME_ZONE,
    }).format(instant),
  );
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function TilesSkeleton() {
  return (
    <>
      <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </>
  );
}

function FeedSkeleton() {
  return <Skeleton className="h-[28rem] rounded-xl xl:mt-10" />;
}
