import { CalendarDays, MapPin, Stethoscope } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell/page-header";
import { ResidentStatusBadge } from "@/components/residents/resident-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/lib/auth/current-staff";
import { ageOn, formatDate } from "@/lib/format";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  STAY_END_REASON_LABELS,
  sexLabel,
} from "@/lib/residents/labels";
import { getResident } from "@/lib/residents/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Loads the resident once per request for both the page and its metadata. A resident outside
 * the caller's scope comes back null, exactly like one that does not exist (ADR 0003).
 */
const loadResident = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) return null;
  await requireStaff();
  const supabase = await createSupabaseServerClient();
  return getResident(supabase, id);
});

export async function generateMetadata(props: PageProps<"/residents/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const resident = await loadResident(id);
  return { title: resident ? resident.full_name : "Resident" };
}

export default async function ResidentPage(props: PageProps<"/residents/[id]">) {
  const { id } = await props.params;
  const resident = await loadResident(id);
  if (!resident) notFound();

  const location = [
    resident.room_number ? `Room ${resident.room_number}` : null,
    resident.unit_name,
    resident.facility_name,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${resident.first_name} ${resident.last_name}`}
        description={`${ageOn(resident.date_of_birth)} · ${sexLabel(resident.sex)} · ${location}`}
      >
        <ResidentStatusBadge status={resident.status} stayEndReason={resident.stay_end_reason} />
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
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
          {resident.status === "former" && resident.stay_ended_on && (
            <Fact label="Stay ended">
              {formatDate(resident.stay_ended_on)}
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
      </div>

      <p className="text-sm text-muted-foreground">
        The clinical timeline and record tabs (conditions, medication orders, vitals, allergies, lab
        results, care plan, incidents, progress notes, appointments, family contacts) arrive with
        the clinical schema.
      </p>
    </div>
  );
}

function FactCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
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
