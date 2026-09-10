import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import type { Enums } from "@/lib/supabase/database.types";

export type CurrentStaff = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  email: string;
  role: Enums<"staff_role">;
  credentials: string | null;
  /** Home facility, or null for operator-wide staff. */
  facility: { id: string; code: string; name: string } | null;
  /** Units a nurse covers, in code order. Empty for admins. */
  units: Array<{ id: string; code: string; name: string; facilityId: string }>;
  /** One line describing what this staff member can see, for the shell and the list pages. */
  scopeDescription: string;
};

/**
 * The signed-in staff member, or null when nobody is signed in or the auth user has no staff
 * record. Verifies the session token, then reads the staff row through Row Level Security
 * (a staff member can always read themself). Memoized for the duration of one request.
 */
export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select(
      `id, first_name, last_name, email, role, credentials,
       facility:facilities (id, code, name),
       assignments:staff_unit_assignments (unit:units (id, code, name, facility_id))`,
    )
    .eq("auth_user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  if (!staff) return null;

  const units = staff.assignments
    .flatMap((assignment) => (assignment.unit ? [assignment.unit] : []))
    .map((unit) => ({
      id: unit.id,
      code: unit.code,
      name: unit.name,
      facilityId: unit.facility_id,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const facility = staff.facility
    ? { id: staff.facility.id, code: staff.facility.code, name: staff.facility.name }
    : null;

  return {
    id: staff.id,
    firstName: staff.first_name,
    lastName: staff.last_name,
    fullName: `${staff.first_name} ${staff.last_name}`,
    initials: `${staff.first_name[0] ?? ""}${staff.last_name[0] ?? ""}`.toUpperCase(),
    email: staff.email ?? String(claimsData?.claims.email ?? ""),
    role: staff.role,
    credentials: staff.credentials,
    facility,
    units,
    scopeDescription: describeScope(staff.role, facility, units),
  };
});

/** The signed-in staff member, or a redirect to the login page. */
export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  return staff;
}

export function describeScope(
  role: Enums<"staff_role">,
  facility: { name: string } | null,
  units: Array<{ name: string }>,
): string {
  if (role === "admin") return "Every resident across all facilities";
  if (units.length === 0) return "No units assigned";
  const unitList = formatList(units.map((unit) => unit.name));
  return facility ? `${unitList} at ${facility.name}` : unitList;
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
