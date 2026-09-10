/**
 * What the forms may pick from: the formulary (every medication the clinical vocabulary lets a
 * care home order) and the allergens the vocabulary documents (ADR 0002). Both are derived from
 * the same catalogs the seed draws from, so a medication order or allergy a nurse records is
 * indistinguishable in shape from a seeded one, and the allergy conflict rule keeps working.
 */
import type { MedicationFrequency } from "@/lib/clinical/medication-schedule";
import { ALLERGY_POOL, FORMULARY, frequencyFor } from "@/lib/seed/vocabulary";
import type { Enums } from "@/lib/supabase/database.types";

export type MedicationOption = {
  code: string;
  system: string;
  name: string;
  /** How the medication is usually given, to preselect in the form. */
  defaultFrequency: MedicationFrequency;
};

export const MEDICATION_OPTIONS: readonly MedicationOption[] = FORMULARY.map((entry) => ({
  code: entry.code,
  system: entry.system,
  name: entry.description,
  defaultFrequency: frequencyFor(entry),
}));

const medicationByName = new Map(
  MEDICATION_OPTIONS.map((option) => [option.name.toLowerCase(), option]),
);

/** The formulary entry a typed name matches, ignoring case and surrounding space. */
export function findMedication(name: string): MedicationOption | undefined {
  return medicationByName.get(name.trim().toLowerCase());
}

export type AllergenOption = {
  code: string;
  name: string;
  category: Enums<"allergy_category">;
  allergyType: Enums<"allergy_type">;
  /** Lowercase ingredient a medication order's name is matched against; null unless a medication. */
  substance: string | null;
  /** Reactions the vocabulary has seen for this allergen, most common first. */
  reactions: string[];
};

const CATEGORY_ORDER: Readonly<Record<Enums<"allergy_category">, number>> = {
  medication: 0,
  food: 1,
  environment: 2,
};

export const ALLERGEN_OPTIONS: readonly AllergenOption[] = ALLERGY_POOL.map((entry) => ({
  code: entry.code,
  name: entry.description,
  category: entry.category,
  allergyType: entry.allergyType,
  substance: entry.substance,
  reactions: [...entry.reactions]
    .sort((a, b) => b.weight - a.weight)
    .map((reaction) => reaction.description),
})).sort(
  (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.name.localeCompare(b.name),
);

const allergenByCode = new Map(ALLERGEN_OPTIONS.map((option) => [option.code, option]));

export function findAllergen(code: string): AllergenOption | undefined {
  return allergenByCode.get(code);
}
