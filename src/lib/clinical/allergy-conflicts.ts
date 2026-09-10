import type { Enums } from "../supabase/database.types";

/**
 * Allergy conflicts: a documented medication allergy against an active medication order whose
 * name contains the allergen. The rule is one function so the seed generator (which avoids
 * manufacturing conflicts), the resident page (which flags them), and the assistant's conflict
 * tool all agree on what a conflict is.
 */

export type ConflictableAllergy = {
  id: string;
  description: string;
  /** Lowercase ingredient a medication order's name is matched against; null unless a medication. */
  substance: string | null;
  severity: Enums<"allergy_severity"> | null;
  reaction: string | null;
  archived_at?: string | null;
};

export type ConflictableOrder = {
  id: string;
  medication: string;
  status: Enums<"medication_order_status">;
  archived_at?: string | null;
};

export type AllergyConflict = {
  allergyId: string;
  orderId: string;
  /** The allergen as documented, for example "Penicillin V". */
  allergy: string;
  substance: string;
  medication: string;
  severity: Enums<"allergy_severity"> | null;
  reaction: string | null;
};

/** True when an order for `medicationName` would conflict with an allergy to `substance`. */
export function conflictsWithAllergy(medicationName: string, substance: string): boolean {
  return medicationName.toLowerCase().includes(substance.toLowerCase());
}

/**
 * Every pairing of a documented medication allergy with an active, unarchived order that names
 * the allergen. Discontinued orders and archived rows never conflict. Ordered by allergy, then
 * by order, as given.
 */
export function findAllergyConflicts(
  allergies: readonly ConflictableAllergy[],
  orders: readonly ConflictableOrder[],
): AllergyConflict[] {
  const conflicts: AllergyConflict[] = [];
  for (const allergy of allergies) {
    if (!allergy.substance || allergy.archived_at) continue;
    for (const order of orders) {
      if (order.status !== "active" || order.archived_at) continue;
      if (!conflictsWithAllergy(order.medication, allergy.substance)) continue;
      conflicts.push({
        allergyId: allergy.id,
        orderId: order.id,
        allergy: allergy.description,
        substance: allergy.substance,
        medication: order.medication,
        severity: allergy.severity,
        reaction: allergy.reaction,
      });
    }
  }
  return conflicts;
}

/** The conflicts each medication order is part of, for flagging rows in the medications tab. */
export function conflictsByOrder(
  conflicts: readonly AllergyConflict[],
): ReadonlyMap<string, AllergyConflict[]> {
  return groupBy(conflicts, (conflict) => conflict.orderId);
}

/** The conflicts each allergy is part of, for flagging rows in the allergies tab. */
export function conflictsByAllergy(
  conflicts: readonly AllergyConflict[],
): ReadonlyMap<string, AllergyConflict[]> {
  return groupBy(conflicts, (conflict) => conflict.allergyId);
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): ReadonlyMap<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(key(item));
    if (list) list.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
}
