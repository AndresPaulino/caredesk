import { Skeleton } from "@/components/ui/skeleton";
import type { ResidentFlag } from "@/lib/clinical/flags";
import { ageOn } from "@/lib/format";
import { sexLabel } from "@/lib/residents/labels";
import type { ResidentDirectoryEntry } from "@/lib/residents/queries";

import { ResidentFlags } from "./resident-flags";
import { ResidentStatusBadge } from "./resident-status-badge";

/**
 * The resident banner, after the patient banner of a hospital record: who this is, where they
 * are, and the flags a nurse checks before care. It sticks to the top of the page so code
 * status and allergies never scroll away while the record is open.
 */
export function ResidentBanner({
  resident,
  flags,
  actions,
}: {
  resident: ResidentDirectoryEntry;
  /** Undefined while the record is still loading. */
  flags: ResidentFlag[] | undefined;
  /** The edit button, which loads its own options. */
  actions: React.ReactNode;
}) {
  const location = [
    resident.room_number ? `Room ${resident.room_number}` : null,
    resident.unit_name,
    resident.facility_name,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <header className="sticky top-0 z-20 -mx-4 -mt-4 border-b bg-card/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/85 md:-mx-6 md:-mt-6 md:px-6">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-willow-100 text-lg font-bold text-willow-900"
        >
          {resident.first_name[0]}
          {resident.last_name[0]}
        </span>
        <div className="min-w-0 flex-1 basis-64 space-y-2">
          <div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight">
                {resident.first_name} {resident.last_name}
              </h1>
              {resident.status === "former" && (
                <ResidentStatusBadge
                  status={resident.status}
                  stayEndReason={resident.stay_end_reason}
                />
              )}
            </div>
            <p className="text-muted-foreground">
              {ageOn(resident.date_of_birth)} years, {sexLabel(resident.sex).toLowerCase()}.{" "}
              {location}
            </p>
          </div>
          {flags === undefined ? (
            <div className="flex gap-1.5" aria-hidden>
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-28 rounded-full" />
            </div>
          ) : flags.length > 0 ? (
            <ResidentFlags flags={flags} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Full code. No known allergies. No fall-risk flag.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
