import { Check, ClipboardCheck, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AssessmentSummaryEntry } from "@/lib/clinical/assessment-summary";
import { formatDate } from "@/lib/format";

/**
 * When each assessment kind was last done and when the next is due, so "last exam" is never
 * a guess. Overdue kinds are marked; a former resident has nothing due.
 */
export function AssessmentSummary({
  entries,
  residentStatus,
}: {
  entries: AssessmentSummaryEntry[];
  residentStatus: "current" | "former";
}) {
  const overdue = entries.filter((entry) => entry.status === "overdue").length;
  // Work first: overdue, then due soon, then everything that needs nothing.
  const ordered = entries.toSorted((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" aria-hidden />
          Assessments
        </CardTitle>
        <CardDescription>
          {residentStatus === "former"
            ? "Nothing is due for a former resident. The last of each kind is kept."
            : "When each kind was last done and when the next is due."}
        </CardDescription>
        {overdue > 0 && (
          <CardAction>
            <Badge className="bg-critical-soft text-critical">
              <TriangleAlert aria-hidden />
              {overdue} overdue
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {ordered.map((entry) => (
            <li
              key={entry.kind}
              className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              data-status={entry.status}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={entry.status === "overdue" ? "font-semibold" : undefined}>
                  {entry.name}
                </span>
                <StatusBadge entry={entry} />
              </div>
              <p className="text-xs text-muted-foreground">
                {entry.lastDone ? (
                  <>
                    Last done{" "}
                    <time dateTime={entry.lastDone.performedAt}>
                      {formatDate(entry.lastDone.performedOn)}
                    </time>
                  </>
                ) : (
                  "Never done"
                )}
                {entry.nextDue && (
                  <>
                    {" · "}Next due{" "}
                    <time dateTime={entry.nextDue}>{formatDate(entry.nextDue)}</time>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const STATUS_ORDER: Record<AssessmentSummaryEntry["status"], number> = {
  overdue: 0,
  due_soon: 1,
  up_to_date: 2,
  not_due: 3,
  not_on_record: 4,
};

/** Colour only where there is work (ADR 0005); "up to date" is a quiet check. */
function StatusBadge({ entry }: { entry: AssessmentSummaryEntry }) {
  switch (entry.status) {
    case "overdue":
      return (
        <Badge className="bg-critical-soft text-critical">
          {entry.daysUntilDue === null
            ? "Overdue, never done"
            : `Overdue ${plural(-entry.daysUntilDue, "day")}`}
        </Badge>
      );
    case "due_soon":
      return (
        <Badge className="bg-attention-soft text-attention">
          {entry.daysUntilDue === 0 ? "Due today" : `Due in ${plural(entry.daysUntilDue!, "day")}`}
        </Badge>
      );
    case "up_to_date":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden />
          Up to date
        </span>
      );
    case "not_on_record":
      return <span className="text-xs text-muted-foreground">Not on record</span>;
    case "not_due":
      return <span className="text-xs text-muted-foreground">Not due</span>;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
