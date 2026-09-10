import { summarizeAssessments, type SummarizableAssessment } from "../clinical/assessment-summary";
import {
  SCHEDULED_HOURS,
  WEEKLY_DOSE_DAY,
  type MedicationFrequency,
} from "../clinical/medication-schedule";
import { shiftAt } from "../clinical/shifts";
import { outOfRangeReadings, type VitalValues } from "../clinical/vital-ranges";
import { addDays, atZoned, dateInZone, weekday } from "../time";

import type { Enums } from "../supabase/database.types";

/**
 * The rules behind the dashboard tiles, as plain functions over a resident's records. The
 * database function `resident_dashboard_at()` applies the same rules in SQL across every
 * resident in scope; this is the readable statement of them, and the oracle the integration
 * test checks the database against. Every window is measured back from `asOf`, the instant
 * the dashboard is computed for.
 */

export const VITALS_WINDOW_HOURS = 24;
export const INCIDENT_WINDOW_DAYS = 7;
/** An administration recorded within this many hours of a dose's time counts as that dose. */
export const ADMINISTRATION_MATCH_HOURS = 2;
/** A dose is overdue once this many minutes have passed since its time with nothing recorded. */
export const DOSE_GRACE_MINUTES = 60;
/** Doses older than this are no longer reported as overdue; the MAR shows the gap. */
export const OVERDUE_DOSE_WINDOW_HOURS = 24;

const HOUR = 3_600_000;
const MINUTE = 60_000;

export type VitalsLike = VitalValues & { taken_at: string; archived_at?: string | null };
export type IncidentLike = { occurred_at: string; archived_at?: string | null };
export type AppointmentLike = {
  scheduled_at: string;
  status: Enums<"appointment_status">;
  archived_at?: string | null;
};
export type OrderLike = {
  id: string;
  frequency: MedicationFrequency;
  status: Enums<"medication_order_status">;
  started_on: string;
  archived_at?: string | null;
};
export type AdministrationLike = {
  medication_order_id: string;
  administered_at: string;
  archived_at?: string | null;
};

/** The flags `resident_dashboard_at()` computes, by their column names. */
export type DashboardFlags = {
  overdue_assessment: boolean;
  out_of_range_vitals: boolean;
  recent_incident: boolean;
  upcoming_appointment: boolean;
  medication_due: boolean;
  medication_overdue: boolean;
};

export type DashboardRecord = {
  assessments: readonly SummarizableAssessment[];
  vitals: readonly VitalsLike[];
  incidents: readonly IncidentLike[];
  appointments: readonly AppointmentLike[];
  medication_orders: readonly OrderLike[];
  administrations: readonly AdministrationLike[];
};

const live = <T extends { archived_at?: string | null }>(row: T) => !row.archived_at;

/** Whether any assessment kind is overdue: the assessment summary's rule. */
export function isOverdueForAssessment(
  assessments: readonly SummarizableAssessment[],
  today: string,
): boolean {
  return summarizeAssessments(assessments, { today, residentStatus: "current" }).some(
    (entry) => entry.status === "overdue",
  );
}

/** A set of vitals taken in the last 24 hours has a reading outside its normal range. */
export function hasOutOfRangeVitals(vitals: readonly VitalsLike[], asOf: Date): boolean {
  const since = asOf.getTime() - VITALS_WINDOW_HOURS * HOUR;
  return vitals.some((set) => {
    if (!live(set)) return false;
    const takenAt = Date.parse(set.taken_at);
    return takenAt > since && takenAt <= asOf.getTime() && outOfRangeReadings(set).length > 0;
  });
}

/** An incident occurred in the last seven days. */
export function hadRecentIncident(incidents: readonly IncidentLike[], asOf: Date): boolean {
  const since = asOf.getTime() - INCIDENT_WINDOW_DAYS * 24 * HOUR;
  return incidents.some((incident) => {
    if (!live(incident)) return false;
    const occurredAt = Date.parse(incident.occurred_at);
    return occurredAt > since && occurredAt <= asOf.getTime();
  });
}

/** A scheduled appointment falls on today's or tomorrow's calendar date. */
export function hasUpcomingAppointment(
  appointments: readonly AppointmentLike[],
  asOf: Date,
): boolean {
  const today = dateInZone(asOf);
  const tomorrow = addDays(today, 1);
  return appointments.some((appointment) => {
    if (!live(appointment) || appointment.status !== "scheduled") return false;
    const date = dateInZone(new Date(appointment.scheduled_at));
    return date === today || date === tomorrow;
  });
}

export type ScheduledDose = { orderId: string; dueAt: Date };

/**
 * Every scheduled dose of the active orders on `asOf`'s calendar date and the day before, at
 * the standard time for the order's frequency. As-needed orders have none.
 */
export function scheduledDoses(orders: readonly OrderLike[], asOf: Date): ScheduledDose[] {
  const today = dateInZone(asOf);
  const doses: ScheduledDose[] = [];
  for (const order of orders) {
    if (!live(order) || order.status !== "active") continue;
    for (const day of [addDays(today, -1), today]) {
      if (order.started_on > day) continue;
      const hours =
        order.frequency === "weekly"
          ? weekday(day) === WEEKLY_DOSE_DAY
            ? SCHEDULED_HOURS.weekly
            : []
          : SCHEDULED_HOURS[order.frequency];
      for (const hour of hours) doses.push({ orderId: order.id, dueAt: atZoned(day, hour) });
    }
  }
  return doses;
}

/** The doses with no administration (given, refused, or held) recorded within two hours. */
export function outstandingDoses(
  doses: readonly ScheduledDose[],
  administrations: readonly AdministrationLike[],
): ScheduledDose[] {
  const window = ADMINISTRATION_MATCH_HOURS * HOUR;
  return doses.filter(
    (dose) =>
      !administrations.some((administration) => {
        if (!live(administration) || administration.medication_order_id !== dose.orderId) {
          return false;
        }
        const at = Date.parse(administration.administered_at);
        return at >= dose.dueAt.getTime() - window && at <= dose.dueAt.getTime() + window;
      }),
  );
}

/**
 * Due: an outstanding dose falls in the current shift, past or still to come. Overdue: an
 * outstanding dose in the last 24 hours is more than an hour past its time.
 */
export function medicationStatus(
  orders: readonly OrderLike[],
  administrations: readonly AdministrationLike[],
  asOf: Date,
): { due: boolean; overdue: boolean } {
  const shift = shiftAt(asOf);
  const outstanding = outstandingDoses(scheduledDoses(orders, asOf), administrations);
  const grace = DOSE_GRACE_MINUTES * MINUTE;
  const oldest = asOf.getTime() - OVERDUE_DOSE_WINDOW_HOURS * HOUR;
  return {
    due: outstanding.some((dose) => dose.dueAt >= shift.startsAt && dose.dueAt < shift.endsAt),
    overdue: outstanding.some(
      (dose) => dose.dueAt.getTime() + grace < asOf.getTime() && dose.dueAt.getTime() > oldest,
    ),
  };
}

/** Every tile's flag for one current resident. */
export function dashboardFlags(record: DashboardRecord, asOf: Date): DashboardFlags {
  const medication = medicationStatus(record.medication_orders, record.administrations, asOf);
  return {
    overdue_assessment: isOverdueForAssessment(record.assessments, dateInZone(asOf)),
    out_of_range_vitals: hasOutOfRangeVitals(record.vitals, asOf),
    recent_incident: hadRecentIncident(record.incidents, asOf),
    upcoming_appointment: hasUpcomingAppointment(record.appointments, asOf),
    medication_due: medication.due,
    medication_overdue: medication.overdue,
  };
}
