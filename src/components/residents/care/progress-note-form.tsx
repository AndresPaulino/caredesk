"use client";

import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { writeProgressNoteAction } from "@/lib/care/actions";
import { progressNoteSchema } from "@/lib/care/schemas";
import { dateTimeLocalInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { TextField, TextareaField } from "./fields";
import { useCareForm } from "./use-care-form";

export function ProgressNoteForm({
  residentId,
  onDone,
}: {
  residentId: string;
  onDone: () => void;
}) {
  const form = useCareForm({
    schema: progressNoteSchema,
    action: writeProgressNoteAction,
    onSuccess: onDone,
  });
  const [now] = useState(() => new Date());

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: residentId }}
      submitLabel="Write note"
      pendingLabel="Writing…"
    >
      <TextField
        name="written_at"
        label="Written at"
        type="datetime-local"
        defaultValue={dateTimeLocalInZone(now)}
        description="Eastern time"
        errors={form.errors.written_at}
      />
      <TextareaField
        name="body"
        label="Note"
        rows={8}
        placeholder="What happened this shift, and what the next one should watch for."
        errors={form.errors.body}
      />
    </CareForm>
  );
}

export function WriteProgressNoteButton({ residentId }: { residentId: string }) {
  return (
    <RecordSheetButton
      label="Write a note"
      icon={NotebookPen}
      title="Write a progress note"
      description="Written in your name and shown on the clinical timeline."
    >
      {(close) => <ProgressNoteForm residentId={residentId} onDone={close} />}
    </RecordSheetButton>
  );
}
