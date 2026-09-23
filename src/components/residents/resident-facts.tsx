import { TriangleAlert } from "lucide-react";

import { conflictsByAllergy, type AllergyConflict } from "@/lib/clinical/allergy-conflicts";
import { ALLERGY_SEVERITY_LABELS } from "@/lib/clinical/labels";
import { ageOn, formatDate } from "@/lib/format";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  STAY_END_REASON_LABELS,
} from "@/lib/residents/labels";
import type { ResidentDirectoryEntry } from "@/lib/residents/queries";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

/**
 * The essentials on one surface: the stay, the care facts, and every allergy with its
 * reaction. The banner above names them; this is where the detail lives.
 */
export function ResidentFacts({
  resident,
  allergies,
  conflicts,
}: {
  resident: ResidentDirectoryEntry;
  allergies: Tables<"allergies">[];
  conflicts: AllergyConflict[];
}) {
  const conflictsFor = conflictsByAllergy(conflicts);

  return (
    <section aria-label="Resident details" className="rounded-xl bg-card ring-1 ring-foreground/10">
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] px-1 py-1">
        <Fact label="Born">
          {formatDate(resident.date_of_birth)}{" "}
          <span className="text-muted-foreground">({ageOn(resident.date_of_birth)})</span>
        </Fact>
        <Fact label="Admitted">{formatDate(resident.admission_date)}</Fact>
        {resident.status === "former" && (
          <Fact label="Stay ended">
            {resident.stay_ended_on ? formatDate(resident.stay_ended_on) : "Date not recorded"}
            {resident.stay_end_reason &&
              `, ${STAY_END_REASON_LABELS[resident.stay_end_reason].toLowerCase()}`}
          </Fact>
        )}
        <Fact label="Code status">{CODE_STATUS_LABELS[resident.code_status]}</Fact>
        <Fact label="Diet">{DIET_LABELS[resident.diet]}</Fact>
        <Fact label="Mobility">{MOBILITY_LABELS[resident.mobility]}</Fact>
        <Fact label="Allergies" className="col-span-full mx-3 border-t px-1">
          {allergies.length === 0 ? (
            <span className="text-muted-foreground">No known allergies</span>
          ) : (
            <ul className="flex flex-wrap gap-x-6 gap-y-1.5">
              {allergies.map((allergy) => {
                const conflicting = conflictsFor.get(allergy.id) ?? [];
                return (
                  <li key={allergy.id}>
                    <span className={cn("font-medium", conflicting.length > 0 && "text-critical")}>
                      {conflicting.length > 0 && (
                        <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />
                      )}
                      {allergy.description}
                    </span>
                    {allergy.severity && (
                      <span className="text-muted-foreground">
                        {" "}
                        {ALLERGY_SEVERITY_LABELS[allergy.severity].toLowerCase()}
                        {allergy.reaction && `, ${allergy.reaction.toLowerCase()}`}
                      </span>
                    )}
                    {conflicting.length > 0 && (
                      <span className="block text-xs text-critical">
                        Conflicts with {conflicting.map((c) => c.medication).join(" and ")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Fact>
      </dl>
    </section>
  );
}

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("px-4 py-3", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
