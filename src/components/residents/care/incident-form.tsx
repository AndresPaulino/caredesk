"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import { reportIncidentAction } from "@/lib/care/actions";
import { incidentSchema } from "@/lib/care/schemas";
import { INCIDENT_KIND_LABELS } from "@/lib/clinical/labels";
import { dateTimeLocalInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { CheckboxField, SelectField, TextField, TextareaField, optionsFrom } from "./fields";
import { useCareForm } from "./use-care-form";

export function IncidentForm({ residentId, onDone }: { residentId: string; onDone: () => void }) {
  const form = useCareForm({
    schema: incidentSchema,
    action: reportIncidentAction,
    onSuccess: onDone,
  });
  const [now] = useState(() => new Date());

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: residentId }}
      submitLabel="Report incident"
      pendingLabel="Reporting…"
    >
      <SelectField
        name="kind"
        label="Kind"
        placeholder="Choose a kind"
        options={optionsFrom(INCIDENT_KIND_LABELS)}
        errors={form.errors.kind}
      />
      <TextField
        name="occurred_at"
        label="Occurred at"
        type="datetime-local"
        defaultValue={dateTimeLocalInZone(now)}
        description="Eastern time"
        errors={form.errors.occurred_at}
      />
      <TextareaField
        name="description"
        label="What happened"
        rows={6}
        placeholder="Where the resident was found, what they said, who was notified."
        errors={form.errors.description}
      />
      <CheckboxField
        name="injury_sustained"
        label="Injury sustained"
        description="Any injury, however minor."
      />
    </CareForm>
  );
}

export function ReportIncidentButton({ residentId }: { residentId: string }) {
  return (
    <RecordSheetButton
      label="Report incident"
      icon={TriangleAlert}
      title="Report an incident"
      description="A fall, a medication error, or a behavioral event, reported in your name."
    >
      {(close) => <IncidentForm residentId={residentId} onDone={close} />}
    </RecordSheetButton>
  );
}
