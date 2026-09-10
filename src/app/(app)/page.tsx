import { Activity, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/current-staff";

export default async function DashboardPage() {
  const staff = await requireStaff();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${staff.firstName}`}
        description="Census and occupancy, medications due, overdue assessments, out-of-range vitals, recent incidents, upcoming appointments, and the live activity feed."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden />
              Your scope
            </CardTitle>
            <CardDescription>{staff.scopeDescription}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              {staff.role === "admin"
                ? "You have operator-wide visibility. Every resident at every facility is in your list."
                : "Residents outside these units do not appear in search, lists, or the assistant's answers. The database enforces the boundary, not the screens."}
            </p>
            <Button size="sm" nativeButton={false} render={<Link href="/residents" />}>
              Open residents
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-4" aria-hidden />
              Setting up
            </CardTitle>
            <CardDescription>
              The dashboard tiles arrive once the clinical schema and the full seed are in place.
              Sign-in, scope, and the resident list are live now.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link href="/health" className="font-medium underline underline-offset-4">
              Check system health
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
