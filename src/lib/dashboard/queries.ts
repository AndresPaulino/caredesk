import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ShiftKey } from "../clinical/shifts";
import type { Database, Views } from "../supabase/database.types";

/**
 * What the dashboard reads, through the caller's session (ADR 0003). The numbers come from
 * `dashboard_tiles_at()`, which computes every tile's rule in one query as of the instant
 * the page is rendered; the census chart reads `unit_occupancy`. A nurse's session sees
 * their units and nothing else, so the same two reads serve both roles.
 */

type Client = SupabaseClient<Database>;

export type DashboardTiles = {
  /** Current residents in scope. */
  residents: number;
  /** Beds in scope. */
  beds: number;
  /** Residents with a scheduled dose still to record this shift. */
  medicationDue: number;
  /** Residents with a dose more than an hour past its time in the last 24 hours. */
  medicationOverdue: number;
  overdueAssessment: number;
  outOfRangeVitals: number;
  /** Incidents in the last seven days, and the residents they involve. */
  incidents: number;
  incidentResidents: number;
  appointmentsToday: number;
  appointmentsTomorrow: number;
  appointmentResidents: number;
  /** The shift the medication tile covers. */
  shift: { key: ShiftKey; name: string; startsAt: string; endsAt: string };
};

export async function getDashboardTiles(supabase: Client, asOf: Date): Promise<DashboardTiles> {
  const { data, error } = await supabase
    .rpc("dashboard_tiles_at", { as_of: asOf.toISOString() })
    .single();
  if (error) throw new Error(`Could not load the dashboard: ${error.message}`);
  return {
    residents: data.residents,
    beds: data.beds,
    medicationDue: data.medication_due,
    medicationOverdue: data.medication_overdue,
    overdueAssessment: data.overdue_assessment,
    outOfRangeVitals: data.out_of_range_vitals,
    incidents: data.incidents,
    incidentResidents: data.incident_residents,
    appointmentsToday: data.appointments_today,
    appointmentsTomorrow: data.appointments_tomorrow,
    appointmentResidents: data.appointment_residents,
    shift: {
      key: data.shift_key as ShiftKey,
      name: data.shift_name,
      startsAt: data.shift_starts_at,
      endsAt: data.shift_ends_at,
    },
  };
}

export type UnitOccupancy = Views<"unit_occupancy">;

/** Beds and current residents for every unit in scope, in facility and unit order. */
export async function listUnitOccupancy(supabase: Client): Promise<UnitOccupancy[]> {
  const { data, error } = await supabase
    .from("unit_occupancy")
    .select("*")
    .order("facility_name")
    .order("unit_code");
  if (error) throw new Error(`Could not load occupancy: ${error.message}`);
  return data ?? [];
}
