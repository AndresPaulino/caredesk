import { ClipboardCheck } from "lucide-react";

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
            <Badge variant="destructive">{overdue} overdue</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {entries.map((entry) => (
            <li
              key={entry.kind}
              className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
              data-status={entry.status}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={entry.status === "overdue" ? "font-medium" : undefined}>
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

function StatusBadge({ entry }: { entry: AssessmentSummaryEntry }) {
  switch (entry.status) {
    case "overdue":
      return (
        <Badge variant="destructive">
          {entry.daysUntilDue === null
            ? "Overdue, never done"
            : `Overdue ${plural(-entry.daysUntilDue, "day")}`}
        </Badge>
      );
    case "due_soon":
      return (
        <Badge variant="secondary">
          {entry.daysUntilDue === 0 ? "Due today" : `Due in ${plural(entry.daysUntilDue!, "day")}`}
        </Badge>
      );
    case "up_to_date":
      return <Badge variant="outline">Up to date</Badge>;
    case "not_on_record":
      return <Badge variant="ghost">Not on record</Badge>;
    case "not_due":
      return <Badge variant="ghost">Not due</Badge>;
  }
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
