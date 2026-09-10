/**
 * The simulator's vocabulary: the simulated nurses, what one of them can see of their units,
 * the six kinds of action they take, and the store they read from and write through. The
 * core (rhythm, plausibility, planning, the loop) is pure over these types; the store is the
 * one seam with a side effect, so tests run it over an in-memory store and the command over
 * the hosted project.
 */
import type { MedicationFrequency } from "../clinical/medication-schedule";
import type { VitalValues } from "../clinical/vital-ranges";
import type { Enums } from "../supabase/database.types";

export type SimulatedNurse = {
  id: string;
  first_name: string;
  last_name: string;
  credentials: string | null;
  facility_id: string;
  /** The units this nurse covers: the only residents they ever act on. */
  unit_ids: string[];
};

export const ACTION_KINDS = [
  "vitals",
  "administration",
  "note",
  "incident",
  "resident_update",
  "appointment",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export const ACTION_LABELS: Readonly<Record<ActionKind, string>> = {
  vitals: "vitals",
  administration: "administrations",
  note: "progress notes",
  incident: "incidents",
  resident_update: "resident details",
  appointment: "appointments",
};

export type SimulatedFacility = { id: string; name: string; city: string };
export type SimulatedUnit = { id: string; facility_id: string; code: string; name: string };
export type SimulatedRoom = { id: string; unit_id: string; number: string; capacity: number };

export type SimulatedOrder = {
  id: string;
  medication: string;
  frequency: MedicationFrequency;
  status: Enums<"medication_order_status">;
  started_on: string;
};

export type SimulatedAdministration = {
  medication_order_id: string;
  administered_at: string;
};

export type LatestVitals = VitalValues & { weight_lb: number | null; taken_at: string };

/** A resident as the simulator sees them: the row plus what plausibility needs to know. */
export type SimulatedResident = {
  id: string;
  first_name: string;
  last_name: string;
  sex: "female" | "male";
  date_of_birth: string;
  admission_date: string;
  status: Enums<"resident_status">;
  facility_id: string;
  unit_id: string;
  room_id: string | null;
  diet: Enums<"diet">;
  mobility: Enums<"mobility">;
  code_status: Enums<"code_status">;
  /** Codes of the resident's unresolved conditions. */
  condition_codes: string[];
  /** Every medication order on the record, discontinued ones included. */
  orders: SimulatedOrder[];
  /** Administrations in the last day or so, to tell which doses are still outstanding. */
  administrations: SimulatedAdministration[];
  latest_vitals: LatestVitals | null;
};

/** What a nurse sees of the units they cover, as of one instant. */
export type UnitSnapshot = {
  facilities: SimulatedFacility[];
  units: SimulatedUnit[];
  rooms: SimulatedRoom[];
  residents: SimulatedResident[];
};

// ---------------------------------------------------------------------------------------------
// Planned actions: the rows the simulator decides, minus the resident and the actor, which
// the store fills in from the resident and the nurse.
// ---------------------------------------------------------------------------------------------

export type VitalsRecord = VitalValues & {
  taken_at: string;
  weight_lb: number | null;
  notes: string | null;
};

export type AdministrationRecord = {
  medication_order_id: string;
  administered_at: string;
  status: Enums<"administration_status">;
  notes: string | null;
};

export type ProgressNoteRecord = { written_at: string; body: string };

export type IncidentRecord = {
  kind: Enums<"incident_kind">;
  occurred_at: string;
  description: string;
  injury_sustained: boolean;
};

export type ResidentChanges = Partial<
  Pick<SimulatedResident, "diet" | "mobility" | "code_status" | "room_id" | "unit_id">
>;

export type AppointmentRecord = {
  kind: Enums<"appointment_kind">;
  scheduled_at: string;
  location: string;
  purpose: string;
};

export type PlannedAction =
  | { kind: "vitals"; resident: SimulatedResident; row: VitalsRecord }
  | {
      kind: "administration";
      resident: SimulatedResident;
      order: SimulatedOrder;
      row: AdministrationRecord;
    }
  | { kind: "note"; resident: SimulatedResident; row: ProgressNoteRecord }
  | { kind: "incident"; resident: SimulatedResident; row: IncidentRecord }
  | {
      kind: "resident_update";
      resident: SimulatedResident;
      changes: ResidentChanges;
      /** The same columns as they were, so a caller can put them back. */
      before: ResidentChanges;
    }
  | { kind: "appointment"; resident: SimulatedResident; row: AppointmentRecord };

export type WrittenTable =
  "vitals" | "administrations" | "progress_notes" | "incidents" | "residents" | "appointments";

export const TABLE_FOR_ACTION: Readonly<Record<ActionKind, WrittenTable>> = {
  vitals: "vitals",
  administration: "administrations",
  note: "progress_notes",
  incident: "incidents",
  resident_update: "residents",
  appointment: "appointments",
};

export type WriteResult = { ok: true; id: string } | { ok: false; message: string };

/** Where the simulator reads the current state and writes its changes. */
export type SimulatorStore = {
  /** The units, rooms, and residents (every status) of the given units, as of `now`. */
  loadUnits(unitIds: readonly string[], now: Date): Promise<UnitSnapshot>;
  /** Writes one action in the nurse's name. Never throws for a rejected write. */
  apply(nurse: SimulatedNurse, action: PlannedAction): Promise<WriteResult>;
};
