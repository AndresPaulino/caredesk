import { Activity } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Census and occupancy, medications due, overdue assessments, out-of-range vitals, recent
          incidents, upcoming appointments, and the live activity feed.
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" aria-hidden />
            Setting up
          </CardTitle>
          <CardDescription>
            CareDesk is connected to its hosted database and assistant model before any resident
            data exists. The tiles above arrive once the clinical schema and seed are in place.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <Link href="/health" className="font-medium underline underline-offset-4">
            Check system health
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
