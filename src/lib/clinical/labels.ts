import type { Enums } from "../supabase/database.types";

/** Display labels for the clinical enumerations. The database keeps the snake_case values. */

export const ALLERGY_CATEGORY_LABELS: Readonly<Record<Enums<"allergy_category">, string>> = {
  food: "Food",
  medication: "Medication",
  environment: "Environment",
};

export const ALLERGY_TYPE_LABELS: Readonly<Record<Enums<"allergy_type">, string>> = {
  allergy: "Allergy",
  intolerance: "Intolerance",
};

export const ALLERGY_SEVERITY_LABELS: Readonly<Record<Enums<"allergy_severity">, string>> = {
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
};

export const MEDICATION_ORDER_STATUS_LABELS: Readonly<
  Record<Enums<"medication_order_status">, string>
> = {
  active: "Active",
  discontinued: "Discontinued",
};

export const ADMINISTRATION_STATUS_LABELS: Readonly<
  Record<Enums<"administration_status">, string>
> = {
  given: "Given",
  refused: "Refused",
  held: "Held",
};

export const CARE_PLAN_STATUS_LABELS: Readonly<Record<Enums<"care_plan_status">, string>> = {
  active: "Active",
  completed: "Completed",
};

export const CARE_PLAN_GOAL_STATUS_LABELS: Readonly<
  Record<Enums<"care_plan_goal_status">, string>
> = {
  in_progress: "In progress",
  met: "Met",
  not_met: "Not met",
};

export const INCIDENT_KIND_LABELS: Readonly<Record<Enums<"incident_kind">, string>> = {
  fall: "Fall",
  medication_error: "Medication error",
  behavioral: "Behavioral event",
};

export const APPOINTMENT_KIND_LABELS: Readonly<Record<Enums<"appointment_kind">, string>> = {
  dialysis: "Dialysis",
  specialist: "Specialist",
  hospital: "Hospital",
  imaging: "Imaging",
  dental: "Dental",
  other: "Other",
};

export const APPOINTMENT_STATUS_LABELS: Readonly<Record<Enums<"appointment_status">, string>> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const FAMILY_RELATIONSHIP_LABELS: Readonly<Record<Enums<"family_relationship">, string>> = {
  spouse: "Spouse",
  daughter: "Daughter",
  son: "Son",
  sibling: "Sibling",
  grandchild: "Grandchild",
  niece_or_nephew: "Niece or nephew",
  friend: "Friend",
  guardian: "Guardian",
  other: "Other",
};
