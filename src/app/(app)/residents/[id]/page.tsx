import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { z } from "zod";

import { PageHeader } from "@/components/app-shell/page-header";
import { AllergyConflictAlert } from "@/components/residents/allergy-conflict-alert";
import { EditResidentDetailsButton } from "@/components/residents/care/resident-details-form";
import { AssessmentSummary } from "@/components/residents/assessment-summary";
import { ClinicalTimeline } from "@/components/residents/clinical-timeline";
import { AllergiesTable } from "@/components/residents/record/allergies-table";
import { AppointmentsTable } from "@/components/residents/record/appointments-table";
import { CarePlanTab } from "@/components/residents/record/care-plan-tab";
import { ConditionsTable } from "@/components/residents/record/conditions-table";
import { FamilyContactsTab } from "@/components/residents/record/family-contacts-tab";
import { IncidentsTable } from "@/components/residents/record/incidents-table";
import { LabResultsTab } from "@/components/residents/record/lab-results-tab";
import { MedicationsTab } from "@/components/residents/record/medications-tab";
import { ProgressNotesList } from "@/components/residents/record/progress-notes-list";
import { VitalsTab } from "@/components/residents/record/vitals-tab";
import { RecordTabs } from "@/components/residents/record-tabs";
import { ResidentRecordSkeleton } from "@/components/residents/resident-record-skeleton";
import { ResidentStatusBadge } from "@/components/residents/resident-status-badge";
import { ResidentSummaryCards } from "@/components/residents/resident-summary-cards";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/auth/current-staff";
import { listPhysicians, listPlacementOptions } from "@/lib/care/options";
import { ALLERGEN_OPTIONS, MEDICATION_OPTIONS } from "@/lib/care/vocabulary";
import { findAllergyConflicts } from "@/lib/clinical/allergy-conflicts";
import { summarizeAssessments } from "@/lib/clinical/assessment-summary";
import { buildTimeline } from "@/lib/clinical/timeline";
import { ageOn } from "@/lib/format";
import { getClinicalRecord } from "@/lib/residents/clinical-record";
import { sexLabel } from "@/lib/residents/labels";
import { getResident, type ResidentDirectoryEntry } from "@/lib/residents/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dateInZone } from "@/lib/time";

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

/**
 * A resident's page: the essentials, the clinical timeline, the assessment summary, and a tab
 * for every record type. The resident is checked before anything streams, so a resident
 * outside scope is a real 404; the record itself streams in behind the header.
 */
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
        <div className="flex flex-wrap items-center gap-3">
          <ResidentStatusBadge status={resident.status} stayEndReason={resident.stay_end_reason} />
          <Suspense
            fallback={
              <Button variant="outline" size="sm" disabled>
                Edit details
              </Button>
            }
          >
            <EditDetails resident={resident} />
          </Suspense>
        </div>
      </PageHeader>

      <Suspense fallback={<ResidentRecordSkeleton />}>
        <ResidentRecord resident={resident} />
      </Suspense>
    </div>
  );
}

/**
 * The edit button, with the units and rooms the caller may move the resident to. Loaded
 * behind the header so the essentials render first.
 */
async function EditDetails({ resident }: { resident: ResidentDirectoryEntry }) {
  const supabase = await createSupabaseServerClient();
  const placement = await listPlacementOptions(supabase, resident.facility_id);
  return <EditResidentDetailsButton resident={resident} placement={placement} />;
}

/** Everything below the header. Every read goes through the signed-in session (ADR 0003). */
async function ResidentRecord({ resident }: { resident: ResidentDirectoryEntry }) {
  const supabase = await createSupabaseServerClient();
  const [record, physicians] = await Promise.all([
    getClinicalRecord(supabase, resident.id),
    listPhysicians(supabase, resident.facility_id),
  ]);

  const today = dateInZone(new Date());
  // A former resident's record is kept, not added to.
  const canRecord = resident.status === "current";
  const conflicts = findAllergyConflicts(record.allergies, record.medication_orders);
  const summary = summarizeAssessments(record.assessments, {
    today,
    residentStatus: resident.status,
  });
  const timeline = buildTimeline(record);

  return (
    <>
      <AllergyConflictAlert residentId={resident.id} conflicts={conflicts} />

      <ResidentSummaryCards
        resident={resident}
        allergies={record.allergies}
        conflicts={conflicts}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="order-last lg:order-none">
          <ClinicalTimeline residentId={resident.id} entries={timeline} today={today} />
        </div>
        <AssessmentSummary entries={summary} residentStatus={resident.status} />
      </div>

      <RecordTabs
        counts={{
          conditions: record.conditions.length,
          medications: record.medication_orders.length,
          vitals: record.vitals.length,
          allergies: record.allergies.length,
          labs: record.lab_results.length,
          "care-plan": record.care_plans.length,
          incidents: record.incidents.length,
          notes: record.progress_notes.length,
          appointments: record.appointments.length,
          family: record.family_contacts.length,
        }}
        panels={{
          conditions: <ConditionsTable conditions={record.conditions} />,
          medications: (
            <MedicationsTab
              residentId={resident.id}
              orders={record.medication_orders}
              administrations={record.administrations}
              conflicts={conflicts}
              canRecord={canRecord}
              formOptions={{
                physicians,
                medications: MEDICATION_OPTIONS,
                conditions: record.conditions
                  .filter((condition) => condition.resolved_on === null)
                  .map((condition) => ({ id: condition.id, description: condition.description })),
                allergySubstances: record.allergies.flatMap((allergy) =>
                  allergy.substance ? [allergy.substance] : [],
                ),
              }}
            />
          ),
          vitals: (
            <VitalsTab residentId={resident.id} vitals={record.vitals} canRecord={canRecord} />
          ),
          allergies: (
            <AllergiesTable
              residentId={resident.id}
              allergies={record.allergies}
              conflicts={conflicts}
              allergens={ALLERGEN_OPTIONS}
            />
          ),
          labs: <LabResultsTab labResults={record.lab_results} />,
          "care-plan": <CarePlanTab carePlans={record.care_plans} conditions={record.conditions} />,
          incidents: (
            <IncidentsTable
              residentId={resident.id}
              incidents={record.incidents}
              canRecord={canRecord}
            />
          ),
          notes: (
            <ProgressNotesList
              residentId={resident.id}
              notes={record.progress_notes}
              canRecord={canRecord}
            />
          ),
          appointments: (
            <AppointmentsTable
              residentId={resident.id}
              appointments={record.appointments}
              canRecord={canRecord}
            />
          ),
          family: <FamilyContactsTab residentId={resident.id} contacts={record.family_contacts} />,
        }}
      />
    </>
  );
}
