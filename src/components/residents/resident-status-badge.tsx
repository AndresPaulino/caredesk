import { Badge } from "@/components/ui/badge";
import { RESIDENT_STATUS_LABELS, STAY_END_REASON_LABELS } from "@/lib/residents/labels";
import type { Enums } from "@/lib/supabase/database.types";

/**
 * "Current" as quiet text, since it is the normal case; for a former resident, a badge with
 * the way their stay ended.
 */
export function ResidentStatusBadge({
  status,
  stayEndReason,
}: {
  status: Enums<"resident_status">;
  stayEndReason: Enums<"stay_end_reason"> | null;
}) {
  if (status === "current") {
    return <span className="text-sm text-muted-foreground">{RESIDENT_STATUS_LABELS.current}</span>;
  }
  return (
    <Badge variant="outline" className="bg-muted">
      {RESIDENT_STATUS_LABELS.former}
      {stayEndReason && (
        <span className="text-muted-foreground">
          , {STAY_END_REASON_LABELS[stayEndReason].toLowerCase()}
        </span>
      )}
    </Badge>
  );
}
