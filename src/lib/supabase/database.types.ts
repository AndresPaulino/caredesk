/**
 * Database types for the Supabase client.
 *
 * Maintained by hand in the shape `supabase gen types typescript` produces, because the CLI's
 * generator needs Docker for a `--db-url` target and this repo runs without it (docs/database.md).
 * Keep it in step with `supabase/migrations/`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type StaffRole = "nurse" | "admin" | "physician";
type ResidentStatus = "current" | "former";
type StayEndReason = "discharged" | "transferred" | "deceased";
type CodeStatus = "full_code" | "dnr" | "dnr_dni" | "comfort_care";
type Diet =
  "regular" | "cardiac" | "diabetic" | "renal" | "mechanical_soft" | "pureed" | "thickened_liquids";
type Mobility =
  | "independent"
  | "cane"
  | "walker"
  | "wheelchair"
  | "one_person_assist"
  | "two_person_assist"
  | "bedbound";
type AssessmentKind =
  | "physician_visit"
  | "nursing_assessment"
  | "wound_check"
  | "podiatry"
  | "dental"
  | "vision"
  | "fall_risk"
  | "lab_draw";
type AllergyCategory = "food" | "medication" | "environment";
type AllergyType = "allergy" | "intolerance";
type AllergySeverity = "mild" | "moderate" | "severe";
type MedicationFrequency =
  | "once_daily"
  | "twice_daily"
  | "three_times_daily"
  | "four_times_daily"
  | "at_bedtime"
  | "weekly"
  | "as_needed";
type MedicationOrderStatus = "active" | "discontinued";
type AdministrationStatus = "given" | "refused" | "held";
type CarePlanStatus = "active" | "completed";
type CarePlanGoalStatus = "in_progress" | "met" | "not_met";
type IncidentKind = "fall" | "medication_error" | "behavioral";
type AppointmentKind = "dialysis" | "specialist" | "hospital" | "imaging" | "dental" | "other";
type AppointmentStatus = "scheduled" | "completed" | "cancelled";
type FamilyRelationship =
  | "spouse"
  | "daughter"
  | "son"
  | "sibling"
  | "grandchild"
  | "niece_or_nephew"
  | "friend"
  | "guardian"
  | "other";
type AuditOperation = "insert" | "update" | "delete";

type FacilityRow = {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type UnitRow = {
  id: string;
  facility_id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type RoomRow = {
  id: string;
  unit_id: string;
  number: string;
  capacity: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type StaffRow = {
  id: string;
  auth_user_id: string | null;
  facility_id: string | null;
  role: StaffRole;
  first_name: string;
  last_name: string;
  credentials: string | null;
  email: string | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type StaffUnitAssignmentRow = {
  staff_id: string;
  unit_id: string;
  created_at: string;
};

type ResidentRow = {
  id: string;
  facility_id: string;
  unit_id: string;
  room_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  sex: string;
  admission_date: string;
  status: ResidentStatus;
  stay_ended_on: string | null;
  stay_end_reason: StayEndReason | null;
  code_status: CodeStatus;
  diet: Diet;
  mobility: Mobility;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AssessmentKindRow = {
  kind: AssessmentKind;
  name: string;
  due_every_days: number;
  expected_for_everyone: boolean;
  sort_order: number;
};

type ConditionRow = {
  id: string;
  resident_id: string;
  code: string;
  code_system: string;
  description: string;
  onset_date: string;
  resolved_on: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AllergyRow = {
  id: string;
  resident_id: string;
  code: string;
  description: string;
  category: AllergyCategory;
  allergy_type: AllergyType;
  substance: string | null;
  reaction: string | null;
  severity: AllergySeverity | null;
  noted_on: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type MedicationOrderRow = {
  id: string;
  resident_id: string;
  code: string;
  code_system: string;
  medication: string;
  frequency: MedicationFrequency;
  instructions: string | null;
  condition_id: string | null;
  prescribed_by: string;
  started_on: string;
  ended_on: string | null;
  status: MedicationOrderStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AdministrationRow = {
  id: string;
  resident_id: string;
  medication_order_id: string;
  administered_at: string;
  administered_by: string;
  status: AdministrationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type VitalsRow = {
  id: string;
  resident_id: string;
  taken_at: string;
  taken_by: string;
  systolic: number;
  diastolic: number;
  pulse: number;
  temperature_f: number;
  respiratory_rate: number;
  oxygen_saturation: number;
  weight_lb: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AssessmentRow = {
  id: string;
  resident_id: string;
  kind: AssessmentKind;
  performed_at: string;
  performed_by: string;
  findings: string;
  score: number | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type LabResultRow = {
  id: string;
  resident_id: string;
  assessment_id: string | null;
  code: string;
  code_system: string;
  description: string;
  value: number;
  units: string;
  reference_low: number | null;
  reference_high: number | null;
  /** Generated by the database from the value and the reference range. */
  abnormal: boolean;
  resulted_at: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type CarePlanRow = {
  id: string;
  resident_id: string;
  code: string;
  description: string;
  condition_id: string | null;
  started_on: string;
  ended_on: string | null;
  status: CarePlanStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type CarePlanGoalRow = {
  id: string;
  resident_id: string;
  care_plan_id: string;
  description: string;
  intervention: string;
  target_date: string | null;
  status: CarePlanGoalStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type IncidentRow = {
  id: string;
  resident_id: string;
  kind: IncidentKind;
  occurred_at: string;
  description: string;
  injury_sustained: boolean;
  reported_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type ProgressNoteRow = {
  id: string;
  resident_id: string;
  written_by: string;
  written_at: string;
  body: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type AppointmentRow = {
  id: string;
  resident_id: string;
  kind: AppointmentKind;
  scheduled_at: string;
  location: string;
  purpose: string;
  status: AppointmentStatus;
  scheduled_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type FamilyContactRow = {
  id: string;
  resident_id: string;
  first_name: string;
  last_name: string;
  relationship: FamilyRelationship;
  phone: string;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type SeedRunRow = {
  id: string;
  seed_number: number;
  anchor: string;
  row_counts: Json;
  completed_at: string;
};

type AuditEventRow = {
  id: string;
  occurred_at: string;
  actor_id: string;
  resident_id: string;
  table_name: string;
  record_id: string;
  operation: AuditOperation;
  old_values: Json | null;
  new_values: Json | null;
  changed_columns: string[];
};

type ResidentDirectoryRow = {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  status: ResidentStatus;
  admission_date: string;
  stay_ended_on: string | null;
  stay_end_reason: StayEndReason | null;
  code_status: CodeStatus;
  diet: Diet;
  mobility: Mobility;
  facility_id: string;
  facility_code: string;
  facility_name: string;
  unit_id: string;
  unit_code: string;
  unit_name: string;
  room_id: string | null;
  room_number: string | null;
  search_text: string;
  archived_at: string | null;
  updated_at: string;
};

type VitalRangeRow = {
  reading: string;
  low: number;
  high: number;
  sort_order: number;
};

type MedicationDoseTimeRow = {
  frequency: MedicationFrequency;
  hour: number;
  weekday: number | null;
};

type ShiftRow = {
  key: string;
  name: string;
  start_hour: number;
  end_hour: number;
  sort_order: number;
};

type UnitOccupancyRow = {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  facility_id: string;
  facility_code: string;
  facility_name: string;
  beds: number;
  residents: number;
};

/** One row of `resident_dashboard_at()`: the directory plus a flag per dashboard tile. */
type ResidentDashboardRow = ResidentDirectoryRow & {
  overdue_assessment: boolean;
  out_of_range_vitals: boolean;
  recent_incident: boolean;
  upcoming_appointment: boolean;
  medication_due: boolean;
  medication_overdue: boolean;
};

/** The one row of `dashboard_tiles_at()`. */
type DashboardTilesRow = {
  residents: number;
  beds: number;
  medication_due: number;
  medication_overdue: number;
  overdue_assessment: number;
  out_of_range_vitals: number;
  incidents: number;
  incident_residents: number;
  appointments_today: number;
  appointments_tomorrow: number;
  appointment_residents: number;
  shift_key: string;
  shift_name: string;
  shift_starts_at: string;
  shift_ends_at: string;
};

type ShiftWindowRow = {
  key: string;
  name: string;
  starts_at: string;
  ends_at: string;
};

/** Columns with defaults or generated values become optional on insert. */
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

/** The soft-delete and bookkeeping columns every clinical table shares. */
type Bookkeeping = "id" | "created_at" | "updated_at" | "archived_at";

type ResidentRelationship = {
  foreignKeyName: string;
  columns: ["resident_id"];
  isOneToOne: false;
  referencedRelation: "residents";
  referencedColumns: ["id"];
};

type StaffRelationship<Column extends string> = {
  foreignKeyName: string;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: "staff";
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      facilities: {
        Row: FacilityRow;
        Insert: Insertable<
          FacilityRow,
          "id" | "state" | "created_at" | "updated_at" | "archived_at"
        >;
        Update: Partial<FacilityRow>;
        Relationships: [];
      };
      units: {
        Row: UnitRow;
        Insert: Insertable<UnitRow, "id" | "created_at" | "updated_at" | "archived_at">;
        Update: Partial<UnitRow>;
        Relationships: [
          {
            foreignKeyName: "units_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facilities";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: RoomRow;
        Insert: Insertable<
          RoomRow,
          "id" | "capacity" | "created_at" | "updated_at" | "archived_at"
        >;
        Update: Partial<RoomRow>;
        Relationships: [
          {
            foreignKeyName: "rooms_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: StaffRow;
        Insert: Insertable<
          StaffRow,
          | "id"
          | "auth_user_id"
          | "facility_id"
          | "credentials"
          | "email"
          | "is_simulated"
          | "created_at"
          | "updated_at"
          | "archived_at"
        >;
        Update: Partial<StaffRow>;
        Relationships: [
          {
            foreignKeyName: "staff_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facilities";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_unit_assignments: {
        Row: StaffUnitAssignmentRow;
        Insert: Insertable<StaffUnitAssignmentRow, "created_at">;
        Update: Partial<StaffUnitAssignmentRow>;
        Relationships: [
          {
            foreignKeyName: "staff_unit_assignments_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_unit_assignments_unit_id_fkey";
            columns: ["unit_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id"];
          },
        ];
      };
      residents: {
        Row: ResidentRow;
        Insert: Insertable<
          ResidentRow,
          | "id"
          | "room_id"
          | "status"
          | "stay_ended_on"
          | "stay_end_reason"
          | "code_status"
          | "diet"
          | "mobility"
          | "created_at"
          | "updated_at"
          | "archived_at"
        >;
        Update: Partial<ResidentRow>;
        Relationships: [
          {
            foreignKeyName: "residents_facility_id_fkey";
            columns: ["facility_id"];
            isOneToOne: false;
            referencedRelation: "facilities";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "residents_unit_id_facility_id_fkey";
            columns: ["unit_id", "facility_id"];
            isOneToOne: false;
            referencedRelation: "units";
            referencedColumns: ["id", "facility_id"];
          },
          {
            foreignKeyName: "residents_room_id_unit_id_fkey";
            columns: ["room_id", "unit_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id", "unit_id"];
          },
        ];
      };
      assessment_kinds: {
        Row: AssessmentKindRow;
        Insert: AssessmentKindRow;
        Update: Partial<AssessmentKindRow>;
        Relationships: [];
      };
      conditions: {
        Row: ConditionRow;
        Insert: Insertable<ConditionRow, Bookkeeping | "code_system" | "resolved_on">;
        Update: Partial<ConditionRow>;
        Relationships: [ResidentRelationship & { foreignKeyName: "conditions_resident_id_fkey" }];
      };
      allergies: {
        Row: AllergyRow;
        Insert: Insertable<
          AllergyRow,
          Bookkeeping | "allergy_type" | "substance" | "reaction" | "severity"
        >;
        Update: Partial<AllergyRow>;
        Relationships: [ResidentRelationship & { foreignKeyName: "allergies_resident_id_fkey" }];
      };
      medication_orders: {
        Row: MedicationOrderRow;
        Insert: Insertable<
          MedicationOrderRow,
          Bookkeeping | "code_system" | "instructions" | "condition_id" | "ended_on" | "status"
        >;
        Update: Partial<MedicationOrderRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "medication_orders_resident_id_fkey" },
          StaffRelationship<"prescribed_by"> & {
            foreignKeyName: "medication_orders_prescribed_by_fkey";
          },
          {
            foreignKeyName: "medication_orders_condition_id_resident_id_fkey";
            columns: ["condition_id", "resident_id"];
            isOneToOne: false;
            referencedRelation: "conditions";
            referencedColumns: ["id", "resident_id"];
          },
        ];
      };
      administrations: {
        Row: AdministrationRow;
        Insert: Insertable<AdministrationRow, Bookkeeping | "status" | "notes">;
        Update: Partial<AdministrationRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "administrations_resident_id_fkey" },
          StaffRelationship<"administered_by"> & {
            foreignKeyName: "administrations_administered_by_fkey";
          },
          {
            foreignKeyName: "administrations_medication_order_id_resident_id_fkey";
            columns: ["medication_order_id", "resident_id"];
            isOneToOne: false;
            referencedRelation: "medication_orders";
            referencedColumns: ["id", "resident_id"];
          },
        ];
      };
      vitals: {
        Row: VitalsRow;
        Insert: Insertable<VitalsRow, Bookkeeping | "weight_lb" | "notes">;
        Update: Partial<VitalsRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "vitals_resident_id_fkey" },
          StaffRelationship<"taken_by"> & { foreignKeyName: "vitals_taken_by_fkey" },
        ];
      };
      assessments: {
        Row: AssessmentRow;
        Insert: Insertable<AssessmentRow, Bookkeeping | "score">;
        Update: Partial<AssessmentRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "assessments_resident_id_fkey" },
          StaffRelationship<"performed_by"> & { foreignKeyName: "assessments_performed_by_fkey" },
          {
            foreignKeyName: "assessments_kind_fkey";
            columns: ["kind"];
            isOneToOne: false;
            referencedRelation: "assessment_kinds";
            referencedColumns: ["kind"];
          },
        ];
      };
      lab_results: {
        Row: LabResultRow;
        Insert: Omit<
          Insertable<
            LabResultRow,
            Bookkeeping | "assessment_id" | "code_system" | "reference_low" | "reference_high"
          >,
          "abnormal"
        >;
        Update: Partial<Omit<LabResultRow, "abnormal">>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "lab_results_resident_id_fkey" },
          {
            foreignKeyName: "lab_results_assessment_id_resident_id_fkey";
            columns: ["assessment_id", "resident_id"];
            isOneToOne: false;
            referencedRelation: "assessments";
            referencedColumns: ["id", "resident_id"];
          },
        ];
      };
      care_plans: {
        Row: CarePlanRow;
        Insert: Insertable<CarePlanRow, Bookkeeping | "condition_id" | "ended_on" | "status">;
        Update: Partial<CarePlanRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "care_plans_resident_id_fkey" },
          {
            foreignKeyName: "care_plans_condition_id_resident_id_fkey";
            columns: ["condition_id", "resident_id"];
            isOneToOne: false;
            referencedRelation: "conditions";
            referencedColumns: ["id", "resident_id"];
          },
        ];
      };
      care_plan_goals: {
        Row: CarePlanGoalRow;
        Insert: Insertable<CarePlanGoalRow, Bookkeeping | "target_date" | "status">;
        Update: Partial<CarePlanGoalRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "care_plan_goals_resident_id_fkey" },
          {
            foreignKeyName: "care_plan_goals_care_plan_id_resident_id_fkey";
            columns: ["care_plan_id", "resident_id"];
            isOneToOne: false;
            referencedRelation: "care_plans";
            referencedColumns: ["id", "resident_id"];
          },
        ];
      };
      incidents: {
        Row: IncidentRow;
        Insert: Insertable<IncidentRow, Bookkeeping | "injury_sustained">;
        Update: Partial<IncidentRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "incidents_resident_id_fkey" },
          StaffRelationship<"reported_by"> & { foreignKeyName: "incidents_reported_by_fkey" },
        ];
      };
      progress_notes: {
        Row: ProgressNoteRow;
        Insert: Insertable<ProgressNoteRow, Bookkeeping>;
        Update: Partial<ProgressNoteRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "progress_notes_resident_id_fkey" },
          StaffRelationship<"written_by"> & { foreignKeyName: "progress_notes_written_by_fkey" },
        ];
      };
      appointments: {
        Row: AppointmentRow;
        Insert: Insertable<AppointmentRow, Bookkeeping | "status">;
        Update: Partial<AppointmentRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "appointments_resident_id_fkey" },
          StaffRelationship<"scheduled_by"> & { foreignKeyName: "appointments_scheduled_by_fkey" },
        ];
      };
      family_contacts: {
        Row: FamilyContactRow;
        Insert: Insertable<FamilyContactRow, Bookkeeping | "email" | "is_primary" | "notes">;
        Update: Partial<FamilyContactRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "family_contacts_resident_id_fkey" },
        ];
      };
      seed_runs: {
        Row: SeedRunRow;
        Insert: Insertable<SeedRunRow, "id" | "completed_at">;
        Update: Partial<SeedRunRow>;
        Relationships: [];
      };
      audit_events: {
        Row: AuditEventRow;
        Insert: Insertable<
          AuditEventRow,
          "id" | "occurred_at" | "old_values" | "new_values" | "changed_columns"
        >;
        Update: Partial<AuditEventRow>;
        Relationships: [
          ResidentRelationship & { foreignKeyName: "audit_events_resident_id_fkey" },
          StaffRelationship<"actor_id"> & { foreignKeyName: "audit_events_actor_id_fkey" },
        ];
      };
      vital_ranges: {
        Row: VitalRangeRow;
        Insert: VitalRangeRow;
        Update: Partial<VitalRangeRow>;
        Relationships: [];
      };
      medication_dose_times: {
        Row: MedicationDoseTimeRow;
        Insert: Insertable<MedicationDoseTimeRow, "weekday">;
        Update: Partial<MedicationDoseTimeRow>;
        Relationships: [];
      };
      shifts: {
        Row: ShiftRow;
        Insert: ShiftRow;
        Update: Partial<ShiftRow>;
        Relationships: [];
      };
    };
    Views: {
      resident_directory: {
        Row: ResidentDirectoryRow;
        Relationships: [];
      };
      unit_occupancy: {
        Row: UnitOccupancyRow;
        Relationships: [];
      };
    };
    Functions: {
      health_check: { Args: Record<PropertyKey, never>; Returns: string };
      current_staff_id: { Args: Record<PropertyKey, never>; Returns: string | null };
      current_staff_role: { Args: Record<PropertyKey, never>; Returns: StaffRole | null };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_unit_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      current_facility_ids: { Args: Record<PropertyKey, never>; Returns: string[] };
      reset_demo_data: { Args: Record<PropertyKey, never>; Returns: undefined };
      current_actor_id: { Args: Record<PropertyKey, never>; Returns: string };
      audit_skipped: { Args: Record<PropertyKey, never>; Returns: boolean };
      vitals_out_of_range: { Args: { v: VitalsRow }; Returns: boolean };
      shift_window: { Args: { at: string }; Returns: ShiftWindowRow[] };
      resident_dashboard_at: { Args: { as_of?: string }; Returns: ResidentDashboardRow[] };
      dashboard_tiles_at: { Args: { as_of?: string }; Returns: DashboardTilesRow[] };
    };
    Enums: {
      staff_role: StaffRole;
      resident_status: ResidentStatus;
      stay_end_reason: StayEndReason;
      code_status: CodeStatus;
      diet: Diet;
      mobility: Mobility;
      assessment_kind: AssessmentKind;
      allergy_category: AllergyCategory;
      allergy_type: AllergyType;
      allergy_severity: AllergySeverity;
      medication_frequency: MedicationFrequency;
      medication_order_status: MedicationOrderStatus;
      administration_status: AdministrationStatus;
      care_plan_status: CarePlanStatus;
      care_plan_goal_status: CarePlanGoalStatus;
      incident_kind: IncidentKind;
      appointment_kind: AppointmentKind;
      appointment_status: AppointmentStatus;
      family_relationship: FamilyRelationship;
      audit_operation: AuditOperation;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
