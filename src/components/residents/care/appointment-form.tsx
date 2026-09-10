"use client";

import { CalendarPlus, CircleOff, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  archiveAppointmentAction,
  cancelAppointmentAction,
  scheduleAppointmentAction,
} from "@/lib/care/actions";
import { appointmentSchema } from "@/lib/care/schemas";
import { APPOINTMENT_KIND_LABELS } from "@/lib/clinical/labels";
import { formatShortDateTime } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import { addDays, atZoned, dateInZone, dateTimeLocalInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { SelectField, TextField, optionsFrom } from "./fields";
import { RowActionsMenu } from "./row-actions-menu";
import { useCareForm } from "./use-care-form";

export function AppointmentForm({
  residentId,
  onDone,
}: {
  residentId: string;
  onDone: () => void;
}) {
  const form = useCareForm({
    schema: appointmentSchema,
    action: scheduleAppointmentAction,
    onSuccess: onDone,
  });
  // Tomorrow at 9 in the morning, Eastern time, is the usual case.
  const [suggested] = useState(() => atZoned(addDays(dateInZone(new Date()), 1), 9));

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: residentId }}
      submitLabel="Schedule"
      pendingLabel="Scheduling…"
    >
      <SelectField
        name="kind"
        label="Kind"
        placeholder="Choose a kind"
        options={optionsFrom(APPOINTMENT_KIND_LABELS)}
        errors={form.errors.kind}
      />
      <TextField
        name="scheduled_at"
        label="Scheduled for"
        type="datetime-local"
        defaultValue={dateTimeLocalInZone(suggested)}
        description="Eastern time"
        errors={form.errors.scheduled_at}
      />
      <TextField
        name="location"
        label="Location"
        placeholder="Bay State Nephrology, Springfield"
        errors={form.errors.location}
      />
      <TextField
        name="purpose"
        label="Purpose"
        placeholder="Routine follow-up"
        errors={form.errors.purpose}
      />
    </CareForm>
  );
}

export function ScheduleAppointmentButton({ residentId }: { residentId: string }) {
  return (
    <RecordSheetButton
      label="Schedule appointment"
      icon={CalendarPlus}
      title="Schedule an appointment"
      description="A visit outside the facility. Transport and preparation follow from the time."
    >
      {(close) => <AppointmentForm residentId={residentId} onDone={close} />}
    </RecordSheetButton>
  );
}

/** Cancel keeps the appointment on the record as cancelled; remove archives it. */
export function AppointmentRowActions({
  residentId,
  appointment,
}: {
  residentId: string;
  appointment: Tables<"appointments">;
}) {
  const [dialog, setDialog] = useState<"cancel" | "remove" | null>(null);
  const when = formatShortDateTime(appointment.scheduled_at);

  return (
    <>
      <RowActionsMenu
        label={`Actions for the ${APPOINTMENT_KIND_LABELS[appointment.kind].toLowerCase()} appointment on ${when}`}
        actions={[
          {
            label: "Cancel appointment",
            icon: CircleOff,
            disabled: appointment.status !== "scheduled",
            onSelect: () => setDialog("cancel"),
          },
          {
            label: "Remove",
            icon: Trash2,
            destructive: true,
            onSelect: () => setDialog("remove"),
          },
        ]}
      />
      <ConfirmActionDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => setDialog(open ? "cancel" : null)}
        title="Cancel this appointment?"
        description={`The ${APPOINTMENT_KIND_LABELS[appointment.kind].toLowerCase()} appointment on ${when} stays on the record, marked cancelled.`}
        action={cancelAppointmentAction}
        fields={{ resident_id: residentId, id: appointment.id }}
        confirmLabel="Cancel appointment"
        pendingLabel="Cancelling…"
      />
      <ConfirmActionDialog
        open={dialog === "remove"}
        onOpenChange={(open) => setDialog(open ? "remove" : null)}
        title="Remove this appointment?"
        description="It leaves the resident's page. Nothing is deleted: the record is archived and stays in the audit trail."
        action={archiveAppointmentAction}
        fields={{ resident_id: residentId, id: appointment.id }}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        destructive
      />
    </>
  );
}
