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

/** Columns with defaults or generated values become optional on insert. */
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

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
        Insert: Insertable<RoomRow, "id" | "created_at" | "updated_at" | "archived_at">;
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
    };
    Views: {
      resident_directory: {
        Row: ResidentDirectoryRow;
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
    };
    Enums: {
      staff_role: StaffRole;
      resident_status: ResidentStatus;
      stay_end_reason: StayEndReason;
      code_status: CodeStatus;
      diet: Diet;
      mobility: Mobility;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Views<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
