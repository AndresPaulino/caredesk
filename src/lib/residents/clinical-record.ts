import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Tables } from "@/lib/supabase/database.types";

/**
 * A resident's whole clinical record, read through the caller's session. Every query is scoped
 * by Row Level Security (ADR 0003): for a resident outside the caller's scope each table
 * simply has no rows, the same as for a resident who does not exist. The page checks the
 * resident first, so in practice this runs only for residents the caller can see.
 *
 * Rows that name a staff member carry them as `staff`, read through the staff policies; a
 * staff member outside the caller's scope comes back null and is shown as unattributed.
 */

export type StaffAttribution = Pick<
  Tables<"staff">,
  "id" | "first_name" | "last_name" | "credentials" | "role"
> | null;

type Attributed<T extends keyof Database["public"]["Tables"]> = Tables<T> & {
  staff: StaffAttribution;
};

export type ClinicalRecord = {
  conditions: Tables<"conditions">[];
  allergies: Tables<"allergies">[];
  medication_orders: Attributed<"medication_orders">[];
  administrations: Attributed<"administrations">[];
  vitals: Attributed<"vitals">[];
  assessments: Attributed<"assessments">[];
  lab_results: Tables<"lab_results">[];
  care_plans: Array<Tables<"care_plans"> & { goals: Tables<"care_plan_goals">[] }>;
  incidents: Attributed<"incidents">[];
  progress_notes: Attributed<"progress_notes">[];
  appointments: Attributed<"appointments">[];
  family_contacts: Tables<"family_contacts">[];
};

const STAFF_COLUMNS = "id, first_name, last_name, credentials, role";

/** `*` plus the staff member behind one foreign key, as `staff`. */
const withStaff = <Key extends string>(foreignKey: Key) =>
  `*, staff:staff!${foreignKey} (${STAFF_COLUMNS})` as const;

/**
 * Every record type for one resident, newest first within each, excluding archived rows.
 * Twelve queries run in parallel; a resident's record is a few hundred rows at most.
 */
export async function getClinicalRecord(
  supabase: SupabaseClient<Database>,
  residentId: string,
): Promise<ClinicalRecord> {
  const forResident = <
    T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T },
  >(
    query: T,
  ) => query.eq("resident_id", residentId).is("archived_at", null);

  const [
    conditions,
    allergies,
    medicationOrders,
    administrations,
    vitals,
    assessments,
    labResults,
    carePlans,
    carePlanGoals,
    incidents,
    progressNotes,
    appointments,
    familyContacts,
  ] = await Promise.all([
    forResident(supabase.from("conditions").select("*"))
      .order("resolved_on", { ascending: true, nullsFirst: true })
      .order("onset_date", { ascending: false }),
    forResident(supabase.from("allergies").select("*"))
      .order("severity", { ascending: false, nullsFirst: false })
      .order("noted_on", { ascending: false }),
    forResident(
      supabase.from("medication_orders").select(withStaff("medication_orders_prescribed_by_fkey")),
    )
      .order("status", { ascending: true })
      .order("started_on", { ascending: false }),
    forResident(
      supabase.from("administrations").select(withStaff("administrations_administered_by_fkey")),
    ).order("administered_at", { ascending: false }),
    forResident(supabase.from("vitals").select(withStaff("vitals_taken_by_fkey"))).order(
      "taken_at",
      { ascending: false },
    ),
    forResident(
      supabase.from("assessments").select(withStaff("assessments_performed_by_fkey")),
    ).order("performed_at", { ascending: false }),
    forResident(supabase.from("lab_results").select("*")).order("resulted_at", {
      ascending: false,
    }),
    forResident(supabase.from("care_plans").select("*"))
      .order("status", { ascending: true })
      .order("started_on", { ascending: false }),
    forResident(supabase.from("care_plan_goals").select("*")).order("target_date", {
      ascending: true,
      nullsFirst: false,
    }),
    forResident(supabase.from("incidents").select(withStaff("incidents_reported_by_fkey"))).order(
      "occurred_at",
      { ascending: false },
    ),
    forResident(
      supabase.from("progress_notes").select(withStaff("progress_notes_written_by_fkey")),
    ).order("written_at", { ascending: false }),
    forResident(
      supabase.from("appointments").select(withStaff("appointments_scheduled_by_fkey")),
    ).order("scheduled_at", { ascending: false }),
    forResident(supabase.from("family_contacts").select("*"))
      .order("is_primary", { ascending: false })
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
  ]);

  const goalsByPlan = new Map<string, Tables<"care_plan_goals">[]>();
  for (const goal of rows("care plan goals", carePlanGoals)) {
    const list = goalsByPlan.get(goal.care_plan_id);
    if (list) list.push(goal);
    else goalsByPlan.set(goal.care_plan_id, [goal]);
  }

  return {
    conditions: rows("conditions", conditions),
    allergies: rows("allergies", allergies),
    medication_orders: rows("medication orders", medicationOrders),
    administrations: rows("administrations", administrations),
    vitals: rows("vitals", vitals),
    assessments: rows("assessments", assessments),
    lab_results: rows("lab results", labResults),
    care_plans: rows("care plans", carePlans).map((plan) => ({
      ...plan,
      goals: goalsByPlan.get(plan.id) ?? [],
    })),
    incidents: rows("incidents", incidents),
    progress_notes: rows("progress notes", progressNotes),
    appointments: rows("appointments", appointments),
    family_contacts: rows("family contacts", familyContacts),
  };
}

function rows<T>(
  label: string,
  result: { data: T[] | null; error: { message: string } | null },
): T[] {
  if (result.error) throw new Error(`Could not load ${label}: ${result.error.message}`);
  return result.data ?? [];
}
