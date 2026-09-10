import { Badge } from "@/components/ui/badge";
import { RESIDENT_STATUS_LABELS, STAY_END_REASON_LABELS } from "@/lib/residents/labels";
import type { Enums } from "@/lib/supabase/database.types";

/** "Current", or for a former resident the way their stay ended. */
export function ResidentStatusBadge({
  status,
  stayEndReason,
}: {
  status: Enums<"resident_status">;
  stayEndReason: Enums<"stay_end_reason"> | null;
}) {
  if (status === "current") {
    return <Badge variant="secondary">{RESIDENT_STATUS_LABELS.current}</Badge>;
  }
  return (
    <Badge variant="outline">
      {RESIDENT_STATUS_LABELS.former}
      {stayEndReason && (
        <span className="text-muted-foreground">· {STAY_END_REASON_LABELS[stayEndReason]}</span>
      )}
    </Badge>
  );
}
