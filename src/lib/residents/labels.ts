import type { Enums } from "@/lib/supabase/database.types";

/** Display labels for the resident enumerations. The database keeps the snake_case values. */

export const CODE_STATUS_LABELS: Record<Enums<"code_status">, string> = {
  full_code: "Full code",
  dnr: "DNR",
  dnr_dni: "DNR/DNI",
  comfort_care: "Comfort care",
};

export const DIET_LABELS: Record<Enums<"diet">, string> = {
  regular: "Regular",
  cardiac: "Cardiac",
  diabetic: "Diabetic",
  renal: "Renal",
  mechanical_soft: "Mechanical soft",
  pureed: "Pureed",
  thickened_liquids: "Thickened liquids",
};

export const MOBILITY_LABELS: Record<Enums<"mobility">, string> = {
  independent: "Independent",
  cane: "Cane",
  walker: "Walker",
  wheelchair: "Wheelchair",
  one_person_assist: "One-person assist",
  two_person_assist: "Two-person assist",
  bedbound: "Bedbound",
};

export const STAY_END_REASON_LABELS: Record<Enums<"stay_end_reason">, string> = {
  discharged: "Discharged",
  transferred: "Transferred",
  deceased: "Deceased",
};

export const RESIDENT_STATUS_LABELS: Record<Enums<"resident_status">, string> = {
  current: "Current",
  former: "Former",
};

export function sexLabel(sex: string): string {
  return sex === "female" ? "Female" : sex === "male" ? "Male" : sex;
}
