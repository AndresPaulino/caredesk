import { ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CARE_PLAN_GOAL_STATUS_LABELS, CARE_PLAN_STATUS_LABELS } from "@/lib/clinical/labels";
import { formatDate } from "@/lib/format";
import type { ClinicalRecord } from "@/lib/residents/clinical-record";
import type { Enums, Tables } from "@/lib/supabase/database.types";

import { RecordEmpty, RecordPanel } from "./record-panel";

const GOAL_VARIANTS: Record<
  Enums<"care_plan_goal_status">,
  "secondary" | "outline" | "destructive"
> = {
  in_progress: "secondary",
  met: "outline",
  not_met: "destructive",
};

/** The resident's goals and the interventions meant to reach them, one card per plan. */
export function CarePlanTab({
  carePlans,
  conditions,
}: {
  carePlans: ClinicalRecord["care_plans"];
  conditions: Tables<"conditions">[];
}) {
  const conditionById = new Map(conditions.map((condition) => [condition.id, condition]));

  return (
    <RecordPanel
      title="Care plan"
      description="Goals and the interventions meant to reach them. The plan is authored at the care conference and is read-only here."
    >
      {carePlans.length === 0 ? (
        <RecordEmpty
          icon={ClipboardList}
          title="No care plan"
          description="No care plan has been recorded for this resident."
        />
      ) : (
        <div className="space-y-4">
          {carePlans.map((plan) => {
            const condition = plan.condition_id ? conditionById.get(plan.condition_id) : null;
            return (
              <Card key={plan.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {plan.description}
                    <Badge variant={plan.status === "active" ? "secondary" : "outline"}>
                      {CARE_PLAN_STATUS_LABELS[plan.status]}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Started {formatDate(plan.started_on)}
                    {plan.ended_on && `, ended ${formatDate(plan.ended_on)}`}
                    {condition && ` · Addresses ${condition.description}`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {plan.goals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No goals recorded.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Goal</TableHead>
                          <TableHead>Intervention</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.goals.map((goal) => (
                          <TableRow key={goal.id}>
                            <TableCell className="min-w-56 whitespace-normal">
                              {goal.description}
                            </TableCell>
                            <TableCell className="min-w-56 whitespace-normal text-muted-foreground">
                              {goal.intervention}
                            </TableCell>
                            <TableCell>
                              {goal.target_date ? (
                                formatDate(goal.target_date)
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={GOAL_VARIANTS[goal.status]}>
                                {CARE_PLAN_GOAL_STATUS_LABELS[goal.status]}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </RecordPanel>
  );
}
