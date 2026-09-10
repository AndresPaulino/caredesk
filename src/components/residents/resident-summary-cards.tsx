import { CalendarDays, MapPin, ShieldAlert, Stethoscope, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { conflictsByAllergy, type AllergyConflict } from "@/lib/clinical/allergy-conflicts";
import { ALLERGY_SEVERITY_LABELS } from "@/lib/clinical/labels";
import { ageOn, formatDate } from "@/lib/format";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  STAY_END_REASON_LABELS,
  sexLabel,
} from "@/lib/residents/labels";
import type { ResidentDirectoryEntry } from "@/lib/residents/queries";
import type { Tables } from "@/lib/supabase/database.types";

/** The essentials at a glance: demographics, the stay, care facts, and allergies. */
export function ResidentSummaryCards({
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
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <FactCard icon={CalendarDays} title="Demographics">
        <Fact label="Date of birth">
          {formatDate(resident.date_of_birth)} ({ageOn(resident.date_of_birth)})
        </Fact>
        <Fact label="Sex">{sexLabel(resident.sex)}</Fact>
      </FactCard>

      <FactCard icon={MapPin} title="Stay">
        <Fact label="Facility">{resident.facility_name}</Fact>
        <Fact label="Unit">{resident.unit_name}</Fact>
        <Fact label="Room">{resident.room_number ?? "Not assigned"}</Fact>
        <Fact label="Admitted">{formatDate(resident.admission_date)}</Fact>
        {resident.status === "former" && (
          <Fact label="Stay ended">
            {resident.stay_ended_on ? formatDate(resident.stay_ended_on) : "Date not recorded"}
            {resident.stay_end_reason &&
              `, ${STAY_END_REASON_LABELS[resident.stay_end_reason].toLowerCase()}`}
          </Fact>
        )}
      </FactCard>

      <FactCard icon={Stethoscope} title="Care">
        <Fact label="Code status">{CODE_STATUS_LABELS[resident.code_status]}</Fact>
        <Fact label="Diet">{DIET_LABELS[resident.diet]}</Fact>
        <Fact label="Mobility">{MOBILITY_LABELS[resident.mobility]}</Fact>
      </FactCard>

      <Card className={conflicts.length > 0 ? "ring-destructive/40" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert
              className={
                conflicts.length > 0 ? "size-4 text-destructive" : "size-4 text-muted-foreground"
              }
              aria-hidden
            />
            Allergies
            {conflicts.length > 0 && (
              <Badge variant="destructive" className="ml-auto">
                <TriangleAlert aria-hidden />
                Conflict
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allergies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No known allergies.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {allergies.map((allergy) => {
                const conflicting = conflictsFor.get(allergy.id) ?? [];
                return (
                  <li key={allergy.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={conflicting.length > 0 ? "font-medium text-destructive" : ""}>
                      {allergy.description}
                    </span>
                    {allergy.severity && (
                      <span className="text-xs text-muted-foreground">
                        {ALLERGY_SEVERITY_LABELS[allergy.severity]}
                        {allergy.reaction && `, ${allergy.reaction.toLowerCase()}`}
                      </span>
                    )}
                    {conflicting.length > 0 && (
                      <span className="basis-full text-xs text-destructive">
                        Conflicts with {conflicting.map((c) => c.medication).join(" and ")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FactCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
