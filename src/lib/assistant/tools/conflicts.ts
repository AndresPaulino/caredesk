import "server-only";

import { findAllergyConflicts, type AllergyConflict } from "@/lib/clinical/allergy-conflicts";
import { ALLERGY_SEVERITY_LABELS } from "@/lib/clinical/labels";
import { getResident, type ResidentDirectoryEntry } from "@/lib/residents/queries";

import {
  allRows,
  inChunks,
  resolveScope,
  residentsInScope,
  sourceFor,
  type ScopeInput,
  type ScopeSummary,
  type SourceRef,
  type ToolContext,
} from "./shared";

/**
 * The allergy conflict check: a documented medication allergy against an active order that
 * names the allergen, by the one rule the resident page and the seed use
 * (`src/lib/clinical/allergy-conflicts.ts`). For one resident it lists the pairs; for a unit,
 * a facility, or the caller's whole scope it names the residents who have one.
 */

export type ConflictDetail = {
  allergyId: string;
  orderId: string;
  /** The allergen as documented, for example "Sulfamethoxazole / Trimethoprim". */
  allergy: string;
  substance: string;
  medication: string;
  severity: string | null;
  reaction: string | null;
};

export type ResidentConflicts = {
  id: string;
  name: string;
  facility: string;
  unit: string;
  room: string | null;
  conflicts: ConflictDetail[];
};

export type ConflictCheckResult =
  | {
      mode: "resident";
      source: SourceRef;
      resident: Omit<ResidentConflicts, "conflicts">;
      conflicts: ConflictDetail[];
      medicationAllergies: number;
      activeOrders: number;
    }
  | {
      mode: "scope";
      scope: ScopeSummary;
      /** Current residents in the scope whose allergies and orders were compared. */
      residentsChecked: number;
      /** By last name, then first name. */
      residentsWithConflicts: ResidentConflicts[];
      /** One chip per resident with a conflict, on the medications tab. */
      sources: SourceRef[];
    };

export type ConflictCheckInput = ScopeInput & {
  /** One resident; leave out to check a unit, a facility, or everything in scope. */
  residentId?: string;
};

/**
 * Conflicts for one resident (null when none is visible), or the residents with a conflict
 * across the units or facilities named.
 */
export async function checkAllergyConflicts(
  { supabase }: ToolContext,
  { residentId, unit, facility }: ConflictCheckInput,
): Promise<ConflictCheckResult | null> {
  if (residentId) {
    const resident = await getResident(supabase, residentId);
    if (!resident) return null;

    const [allergies, orders] = await Promise.all([
      supabase
        .from("allergies")
        .select("id, description, substance, severity, reaction, archived_at")
        .eq("resident_id", residentId)
        .is("archived_at", null)
        .not("substance", "is", null),
      supabase
        .from("medication_orders")
        .select("id, medication, status, archived_at")
        .eq("resident_id", residentId)
        .eq("status", "active")
        .is("archived_at", null),
    ]);
    if (allergies.error) throw new Error(`Could not load allergies: ${allergies.error.message}`);
    if (orders.error) throw new Error(`Could not load medication orders: ${orders.error.message}`);

    return {
      mode: "resident",
      source: sourceFor(resident, "medications"),
      resident: describeResident(resident),
      conflicts: findAllergyConflicts(allergies.data ?? [], orders.data ?? []).map(detail),
      medicationAllergies: allergies.data?.length ?? 0,
      activeOrders: orders.data?.length ?? 0,
    };
  }

  const scope = await resolveScope(supabase, { unit, facility });
  const summary = {
    description: scope.description,
    units: scope.units,
    facilities: scope.facilities,
  };
  if (scope.unitIds?.length === 0 || scope.facilityIds?.length === 0) {
    return {
      mode: "scope",
      scope: summary,
      residentsChecked: 0,
      residentsWithConflicts: [],
      sources: [],
    };
  }

  const [residents, allergies] = await Promise.all([
    residentsInScope(supabase, scope).select(
      "id, full_name, facility_name, unit_name, room_number, last_name, first_name",
    ),
    // Medication allergies of current residents in the scope, joined inward so the resident
    // filter excludes the allergy rather than blanking the embed.
    allRows((from, to) => {
      let query = supabase
        .from("allergies")
        .select(
          "id, resident_id, description, substance, severity, reaction, archived_at, resident:residents!inner (id, unit_id, facility_id, status)",
        )
        .is("archived_at", null)
        .not("substance", "is", null)
        .eq("resident.status", "current");
      if (scope.unitIds) query = query.in("resident.unit_id", scope.unitIds);
      else if (scope.facilityIds) query = query.in("resident.facility_id", scope.facilityIds);
      return query.order("id").range(from, to);
    }, "allergies"),
  ]);
  if (residents.error) throw new Error(`Could not load residents: ${residents.error.message}`);

  const allergiesByResident = new Map<string, typeof allergies>();
  for (const allergy of allergies) {
    const list = allergiesByResident.get(allergy.resident_id) ?? [];
    list.push(allergy);
    allergiesByResident.set(allergy.resident_id, list);
  }

  const orders = await inChunks([...allergiesByResident.keys()], async (chunk) => {
    const { data, error } = await supabase
      .from("medication_orders")
      .select("id, resident_id, medication, status, archived_at")
      .in("resident_id", chunk)
      .eq("status", "active")
      .is("archived_at", null);
    if (error) throw new Error(`Could not load medication orders: ${error.message}`);
    return data;
  });
  const ordersByResident = new Map<string, typeof orders>();
  for (const order of orders) {
    const list = ordersByResident.get(order.resident_id) ?? [];
    list.push(order);
    ordersByResident.set(order.resident_id, list);
  }

  const withConflicts: ResidentConflicts[] = [];
  for (const resident of residents.data ?? []) {
    const conflicts = findAllergyConflicts(
      allergiesByResident.get(resident.id) ?? [],
      ordersByResident.get(resident.id) ?? [],
    );
    if (conflicts.length === 0) continue;
    withConflicts.push({
      id: resident.id,
      name: resident.full_name,
      facility: resident.facility_name,
      unit: resident.unit_name,
      room: resident.room_number,
      conflicts: conflicts.map(detail),
    });
  }
  withConflicts.sort((a, b) => a.name.localeCompare(b.name));

  return {
    mode: "scope",
    scope: summary,
    residentsChecked: residents.data?.length ?? 0,
    residentsWithConflicts: withConflicts,
    sources: withConflicts.map((resident) => ({
      residentId: resident.id,
      residentName: resident.name,
      tab: "medications",
    })),
  };
}

function describeResident(resident: ResidentDirectoryEntry): Omit<ResidentConflicts, "conflicts"> {
  return {
    id: resident.id,
    name: resident.full_name,
    facility: resident.facility_name,
    unit: resident.unit_name,
    room: resident.room_number,
  };
}

function detail(conflict: AllergyConflict): ConflictDetail {
  return {
    allergyId: conflict.allergyId,
    orderId: conflict.orderId,
    allergy: conflict.allergy,
    substance: conflict.substance,
    medication: conflict.medication,
    severity: conflict.severity ? ALLERGY_SEVERITY_LABELS[conflict.severity] : null,
    reaction: conflict.reaction,
  };
}
