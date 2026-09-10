"use client";

import { Ban, Check, CircleOff, Loader2, PauseCircle, Pill, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  addMedicationOrderAction,
  discontinueMedicationOrderAction,
  recordAdministrationAction,
} from "@/lib/care/actions";
import type { PhysicianOption } from "@/lib/care/options";
import { medicationOrderSchema } from "@/lib/care/schemas";
import type { MedicationOption } from "@/lib/care/vocabulary";
import { conflictsWithAllergy } from "@/lib/clinical/allergy-conflicts";
import {
  MEDICATION_FREQUENCY_LABELS,
  type MedicationFrequency,
} from "@/lib/clinical/medication-schedule";
import type { Tables } from "@/lib/supabase/database.types";
import { dateInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { SelectField, TextField, TextareaField, optionsFrom } from "./fields";
import { RowActionsMenu } from "./row-actions-menu";
import { useCareForm } from "./use-care-form";

export type MedicationOrderFormOptions = {
  physicians: PhysicianOption[];
  medications: readonly MedicationOption[];
  /** The resident's active conditions, so an order can say what it treats. */
  conditions: Array<Pick<Tables<"conditions">, "id" | "description">>;
  /** Substances of the resident's documented medication allergies, for the conflict warning. */
  allergySubstances: string[];
};

export function MedicationOrderForm({
  residentId,
  options,
  onDone,
}: {
  residentId: string;
  options: MedicationOrderFormOptions;
  onDone: () => void;
}) {
  const form = useCareForm({
    schema: medicationOrderSchema,
    action: addMedicationOrderAction,
    onSuccess: onDone,
  });
  const [today] = useState(() => dateInZone(new Date()));
  const [medicationName, setMedicationName] = useState("");
  const [frequency, setFrequency] = useState<MedicationFrequency | "">("");
  const formularyListId = useId();

  const chosen = options.medications.find(
    (option) => option.name.toLowerCase() === medicationName.trim().toLowerCase(),
  );
  const conflictingSubstance = chosen
    ? options.allergySubstances.find((substance) => conflictsWithAllergy(chosen.name, substance))
    : undefined;

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: residentId }}
      submitLabel="Add order"
      pendingLabel="Adding…"
    >
      <TextField
        name="medication"
        label="Medication"
        list={formularyListId}
        autoComplete="off"
        placeholder="Start typing to search the formulary"
        value={medicationName}
        onChange={(event) => {
          const name = event.currentTarget.value;
          setMedicationName(name);
          const match = options.medications.find(
            (option) => option.name.toLowerCase() === name.trim().toLowerCase(),
          );
          if (match) setFrequency(match.defaultFrequency);
        }}
        description={
          chosen ? `${chosen.system} ${chosen.code}` : "Pick an entry from the formulary list."
        }
        errors={form.errors.medication}
      />
      <datalist id={formularyListId}>
        {options.medications.map((option) => (
          <option key={option.code} value={option.name} />
        ))}
      </datalist>
      {conflictingSubstance && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Conflicts with a documented {conflictingSubstance} allergy</AlertTitle>
          <AlertDescription>
            The order can still be added; the conflict is flagged on the resident&apos;s page until
            it is resolved.
          </AlertDescription>
        </Alert>
      )}
      <SelectField
        name="frequency"
        label="Frequency"
        placeholder="Choose how often"
        options={optionsFrom(MEDICATION_FREQUENCY_LABELS)}
        value={frequency}
        onChange={(event) => setFrequency(event.currentTarget.value as MedicationFrequency | "")}
        errors={form.errors.frequency}
      />
      <TextField
        name="instructions"
        label="Instructions"
        placeholder="With food; hold if systolic below 100"
        description="Optional"
        errors={form.errors.instructions}
      />
      <SelectField
        name="condition_id"
        label="Treats"
        placeholder="Not linked to a condition"
        options={options.conditions.map((condition) => ({
          value: condition.id,
          label: condition.description,
        }))}
        errors={form.errors.condition_id}
      />
      <SelectField
        name="prescribed_by"
        label="Prescribed by"
        placeholder="Choose a physician"
        options={options.physicians.map((physician) => ({
          value: physician.id,
          label: physician.name,
        }))}
        errors={form.errors.prescribed_by}
      />
      <TextField
        name="started_on"
        label="Starts on"
        type="date"
        defaultValue={today}
        max={today}
        errors={form.errors.started_on}
      />
    </CareForm>
  );
}

export function AddMedicationOrderButton({
  residentId,
  options,
}: {
  residentId: string;
  options: MedicationOrderFormOptions;
}) {
  return (
    <RecordSheetButton
      label="Add order"
      icon={Pill}
      title="Add a medication order"
      description="A prescription entered on the physician's behalf. It is checked against the resident's allergies as you type."
    >
      {(close) => <MedicationOrderForm residentId={residentId} options={options} onDone={close} />}
    </RecordSheetButton>
  );
}

/** One click records a dose as given, now, in the signed-in staff member's name. */
export function MarkGivenButton({
  residentId,
  order,
}: {
  residentId: string;
  order: Pick<Tables<"medication_orders">, "id" | "medication">;
}) {
  const form = useCareForm({ action: recordAdministrationAction, toastErrors: true });
  return (
    <form action={form.formAction} className="contents">
      <input type="hidden" name="resident_id" value={residentId} />
      <input type="hidden" name="medication_order_id" value={order.id} />
      <input type="hidden" name="status" value="given" />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={form.pending}
        aria-label={`Mark ${order.medication} as given`}
      >
        {form.pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
        ) : (
          <Check data-icon="inline-start" aria-hidden />
        )}
        Mark given
      </Button>
    </form>
  );
}

type AdministrationDialog = "refused" | "held";

/** Mark given inline; refused, held, and discontinue behind the menu. Active orders only. */
export function OrderRowActions({
  residentId,
  order,
}: {
  residentId: string;
  order: Pick<Tables<"medication_orders">, "id" | "medication" | "status">;
}) {
  const [dialog, setDialog] = useState<AdministrationDialog | "discontinue" | null>(null);
  if (order.status !== "active") return null;

  const administration = dialog === "refused" || dialog === "held" ? dialog : null;

  return (
    <div className="flex items-center justify-end gap-1">
      <MarkGivenButton residentId={residentId} order={order} />
      <RowActionsMenu
        label={`More actions for ${order.medication}`}
        actions={[
          { label: "Mark refused", icon: Ban, onSelect: () => setDialog("refused") },
          { label: "Mark held", icon: PauseCircle, onSelect: () => setDialog("held") },
          {
            label: "Discontinue order",
            icon: CircleOff,
            destructive: true,
            onSelect: () => setDialog("discontinue"),
          },
        ]}
      />
      <ConfirmActionDialog
        open={administration !== null}
        onOpenChange={(open) => setDialog(open ? administration : null)}
        title={`Mark ${order.medication} as ${administration ?? "refused"}`}
        description="Recorded now, in your name, on the medication administration record."
        action={recordAdministrationAction}
        fields={{
          resident_id: residentId,
          medication_order_id: order.id,
          status: administration ?? "refused",
        }}
        confirmLabel={administration === "held" ? "Mark held" : "Mark refused"}
        pendingLabel="Recording…"
      >
        <TextareaField
          name="notes"
          label="Notes"
          placeholder={
            administration === "held" ? "Held per physician; nausea." : "Declined; will reoffer."
          }
          description="Optional"
        />
      </ConfirmActionDialog>
      <ConfirmActionDialog
        open={dialog === "discontinue"}
        onOpenChange={(open) => setDialog(open ? "discontinue" : null)}
        title={`Discontinue ${order.medication}?`}
        description="The order ends today. Its administrations stay on the record, and it stops counting as an allergy conflict."
        action={discontinueMedicationOrderAction}
        fields={{ resident_id: residentId, id: order.id }}
        confirmLabel="Discontinue"
        pendingLabel="Discontinuing…"
        destructive
      />
    </div>
  );
}
