"use client";

import { Pencil, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

import {
  addFamilyContactAction,
  archiveFamilyContactAction,
  updateFamilyContactAction,
} from "@/lib/care/actions";
import { familyContactSchema } from "@/lib/care/schemas";
import { FAMILY_RELATIONSHIP_LABELS } from "@/lib/clinical/labels";
import type { Tables } from "@/lib/supabase/database.types";

import { CareForm, CareSheet, RecordSheetButton } from "./care-sheet";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { CheckboxField, SelectField, TextField, TextareaField, optionsFrom } from "./fields";
import { RowActionsMenu } from "./row-actions-menu";
import { useCareForm } from "./use-care-form";

type Contact = Tables<"family_contacts">;

/** One form for adding and editing: with a contact it edits, without one it adds. */
export function FamilyContactForm({
  residentId,
  contact,
  onDone,
}: {
  residentId: string;
  contact?: Contact;
  onDone: () => void;
}) {
  const form = useCareForm({
    schema: familyContactSchema,
    action: contact ? updateFamilyContactAction : addFamilyContactAction,
    onSuccess: onDone,
  });

  return (
    <CareForm
      form={form}
      hidden={contact ? { resident_id: residentId, id: contact.id } : { resident_id: residentId }}
      submitLabel={contact ? "Save changes" : "Add contact"}
      pendingLabel="Saving…"
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="first_name"
          label="First name"
          autoComplete="off"
          defaultValue={contact?.first_name}
          errors={form.errors.first_name}
        />
        <TextField
          name="last_name"
          label="Last name"
          autoComplete="off"
          defaultValue={contact?.last_name}
          errors={form.errors.last_name}
        />
      </div>
      <SelectField
        name="relationship"
        label="Relationship"
        placeholder="Choose a relationship"
        options={optionsFrom(FAMILY_RELATIONSHIP_LABELS)}
        defaultValue={contact?.relationship ?? ""}
        errors={form.errors.relationship}
      />
      <TextField
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="off"
        placeholder="(617) 555-0142"
        defaultValue={contact?.phone}
        errors={form.errors.phone}
      />
      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="off"
        description="Optional"
        defaultValue={contact?.email ?? ""}
        errors={form.errors.email}
      />
      <CheckboxField
        name="is_primary"
        label="Primary contact"
        description="The first person to call. A resident has one primary contact."
        defaultChecked={contact?.is_primary ?? false}
      />
      <TextareaField
        name="notes"
        label="Notes"
        placeholder="Best times to call, languages, anything the desk should know."
        defaultValue={contact?.notes ?? ""}
        errors={form.errors.notes}
      />
    </CareForm>
  );
}

export function AddFamilyContactButton({ residentId }: { residentId: string }) {
  return (
    <RecordSheetButton
      label="Add contact"
      icon={UserPlus}
      title="Add a family contact"
      description="A relative or guardian to call about this resident."
    >
      {(close) => <FamilyContactForm residentId={residentId} onDone={close} />}
    </RecordSheetButton>
  );
}

/** Edit opens the same form prefilled; remove archives the contact. */
export function FamilyContactActions({
  residentId,
  contact,
}: {
  residentId: string;
  contact: Contact;
}) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const name = `${contact.first_name} ${contact.last_name}`;

  return (
    <>
      <RowActionsMenu
        label={`Actions for ${name}`}
        actions={[
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          { label: "Remove", icon: Trash2, destructive: true, onSelect: () => setRemoving(true) },
        ]}
      />
      <CareSheet
        open={editing}
        onOpenChange={setEditing}
        title={`Edit ${name}`}
        description="Changes show on the resident's page as soon as they are saved."
      >
        <FamilyContactForm
          residentId={residentId}
          contact={contact}
          onDone={() => setEditing(false)}
        />
      </CareSheet>
      <ConfirmActionDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove ${name}?`}
        description="They leave the resident's page. Nothing is deleted: the record is archived and stays in the audit trail."
        action={archiveFamilyContactAction}
        fields={{ resident_id: residentId, id: contact.id }}
        confirmLabel="Remove"
        pendingLabel="Removing…"
        destructive
      />
    </>
  );
}
