"use client";

import { ShieldPlus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { addAllergyAction, archiveAllergyAction } from "@/lib/care/actions";
import { allergySchema } from "@/lib/care/schemas";
import type { AllergenOption } from "@/lib/care/vocabulary";
import {
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
} from "@/lib/clinical/labels";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { dateInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { SelectField, TextField, optionsFrom, type SelectGroup } from "./fields";
import { RowActionsMenu } from "./row-actions-menu";
import { useCareForm } from "./use-care-form";

const CATEGORY_ORDER: Enums<"allergy_category">[] = ["medication", "food", "environment"];

export function AllergyForm({
  residentId,
  allergens,
  onDone,
}: {
  residentId: string;
  allergens: readonly AllergenOption[];
  onDone: () => void;
}) {
  const form = useCareForm({ schema: allergySchema, action: addAllergyAction, onSuccess: onDone });
  const [today] = useState(() => dateInZone(new Date()));
  const [code, setCode] = useState("");
  const reactionsListId = useId();

  const allergen = allergens.find((option) => option.code === code);
  const groups: SelectGroup[] = CATEGORY_ORDER.map((category) => ({
    label: ALLERGY_CATEGORY_LABELS[category],
    options: allergens
      .filter((option) => option.category === category)
      .map((option) => ({ value: option.code, label: option.name })),
  })).filter((group) => group.options.length > 0);

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: residentId }}
      submitLabel="Add allergy"
      pendingLabel="Adding…"
    >
      <SelectField
        name="code"
        label="Allergen"
        placeholder="Choose an allergen"
        groups={groups}
        value={code}
        onChange={(event) => setCode(event.currentTarget.value)}
        description={
          allergen?.substance
            ? `Active medication orders naming ${allergen.substance} will be flagged as conflicts.`
            : undefined
        }
        errors={form.errors.code}
      />
      <SelectField
        name="allergy_type"
        label="Type"
        options={optionsFrom(ALLERGY_TYPE_LABELS)}
        key={`type-${allergen?.allergyType ?? "allergy"}`}
        defaultValue={allergen?.allergyType ?? "allergy"}
        errors={form.errors.allergy_type}
      />
      <TextField
        name="reaction"
        label="Reaction"
        list={reactionsListId}
        autoComplete="off"
        placeholder={allergen?.reactions[0] ?? "Hives"}
        description="Optional"
        errors={form.errors.reaction}
      />
      <datalist id={reactionsListId}>
        {allergen?.reactions.map((reaction) => (
          <option key={reaction} value={reaction} />
        ))}
      </datalist>
      <SelectField
        name="severity"
        label="Severity"
        placeholder="Not recorded"
        options={optionsFrom(ALLERGY_SEVERITY_LABELS)}
        errors={form.errors.severity}
      />
      <TextField
        name="noted_on"
        label="Noted on"
        type="date"
        defaultValue={today}
        max={today}
        errors={form.errors.noted_on}
      />
    </CareForm>
  );
}

export function AddAllergyButton({
  residentId,
  allergens,
}: {
  residentId: string;
  allergens: readonly AllergenOption[];
}) {
  return (
    <RecordSheetButton
      label="Add allergy"
      icon={ShieldPlus}
      title="Add an allergy"
      description="Documented at once, so a new order that names the allergen is flagged before harm."
    >
      {(close) => <AllergyForm residentId={residentId} allergens={allergens} onDone={close} />}
    </RecordSheetButton>
  );
}

export function AllergyRowActions({
  residentId,
  allergy,
}: {
  residentId: string;
  allergy: Tables<"allergies">;
}) {
  const [removing, setRemoving] = useState(false);
  return (
    <>
      <RowActionsMenu
        label={`Actions for the ${allergy.description} allergy`}
        actions={[
          { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setRemoving(true) },
        ]}
      />
      <ConfirmActionDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove the ${allergy.description} allergy?`}
        description="It leaves the resident's page and stops flagging conflicts. Nothing is deleted: the record is archived and stays in the audit trail."
        action={archiveAllergyAction}
        fields={{ resident_id: residentId, id: allergy.id }}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        destructive
      />
    </>
  );
}
