"use client";

import { Activity } from "lucide-react";
import { useState } from "react";

import { recordVitalsAction } from "@/lib/care/actions";
import { vitalsSchema } from "@/lib/care/schemas";
import { dateTimeLocalInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { TextField, TextareaField } from "./fields";
import { useCareForm } from "./use-care-form";

export function VitalsForm({ residentId, onDone }: { residentId: string; onDone: () => void }) {
  const form = useCareForm({ schema: vitalsSchema, action: recordVitalsAction, onSuccess: onDone });
  const [now] = useState(() => new Date());

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: residentId }}
      submitLabel="Record vitals"
      pendingLabel="Recording…"
    >
      <TextField
        name="taken_at"
        label="Taken at"
        type="datetime-local"
        defaultValue={dateTimeLocalInZone(now)}
        description="Eastern time"
        errors={form.errors.taken_at}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="systolic"
          label="Systolic"
          type="number"
          inputMode="numeric"
          placeholder="120"
          errors={form.errors.systolic}
        />
        <TextField
          name="diastolic"
          label="Diastolic"
          type="number"
          inputMode="numeric"
          placeholder="80"
          errors={form.errors.diastolic}
        />
        <TextField
          name="pulse"
          label="Pulse"
          type="number"
          inputMode="numeric"
          placeholder="72"
          errors={form.errors.pulse}
        />
        <TextField
          name="temperature_f"
          label="Temperature °F"
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="98.4"
          errors={form.errors.temperature_f}
        />
        <TextField
          name="respiratory_rate"
          label="Respiration"
          type="number"
          inputMode="numeric"
          placeholder="16"
          errors={form.errors.respiratory_rate}
        />
        <TextField
          name="oxygen_saturation"
          label="SpO₂ %"
          type="number"
          inputMode="numeric"
          placeholder="97"
          errors={form.errors.oxygen_saturation}
        />
        <TextField
          name="weight_lb"
          label="Weight lb"
          type="number"
          inputMode="decimal"
          step="0.1"
          description="Optional"
          errors={form.errors.weight_lb}
        />
      </div>
      <TextareaField
        name="notes"
        label="Notes"
        placeholder="Anything the next shift should know"
        errors={form.errors.notes}
      />
    </CareForm>
  );
}

export function RecordVitalsButton({ residentId }: { residentId: string }) {
  return (
    <RecordSheetButton
      label="Record vitals"
      icon={Activity}
      title="Record vitals"
      description="A set of readings taken at one moment. A reading outside its normal range is flagged on the page."
    >
      {(close) => <VitalsForm residentId={residentId} onDone={close} />}
    </RecordSheetButton>
  );
}
