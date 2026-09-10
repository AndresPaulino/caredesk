"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";

import { updateResidentDetailsAction } from "@/lib/care/actions";
import type { PlacementOptions } from "@/lib/care/options";
import { residentDetailsSchema } from "@/lib/care/schemas";
import {
  CODE_STATUS_LABELS,
  DIET_LABELS,
  MOBILITY_LABELS,
  RESIDENT_STATUS_LABELS,
  STAY_END_REASON_LABELS,
} from "@/lib/residents/labels";
import type { ResidentDirectoryEntry } from "@/lib/residents/queries";
import type { Enums } from "@/lib/supabase/database.types";
import { dateInZone } from "@/lib/time";

import { CareForm, RecordSheetButton } from "./care-sheet";
import { SelectField, TextField, optionsFrom } from "./fields";
import { useCareForm } from "./use-care-form";

/**
 * Demographics, the stay, and care facts on one form. Ending a stay frees the room; a room
 * can only be chosen on the resident's unit and only while it has a free bed. A nurse's unit
 * list holds only the units they cover, so a resident cannot be moved out of their scope.
 */
export function ResidentDetailsForm({
  resident,
  placement,
  onDone,
}: {
  resident: ResidentDirectoryEntry;
  placement: PlacementOptions;
  onDone: () => void;
}) {
  const form = useCareForm({
    schema: residentDetailsSchema,
    action: updateResidentDetailsAction,
    onSuccess: onDone,
  });
  const [today] = useState(() => dateInZone(new Date()));
  const [status, setStatus] = useState<Enums<"resident_status">>(resident.status);
  const [unitId, setUnitId] = useState(resident.unit_id);
  const [roomId, setRoomId] = useState(resident.room_id ?? "");

  const former = status === "former";
  const roomOptions = placement.rooms
    .filter((room) => room.unitId === unitId)
    .map((room) => {
      const current = room.id === resident.room_id;
      const free = room.capacity - room.occupied;
      const beds =
        current && !former
          ? "this resident's room"
          : `${free} of ${room.capacity} ${room.capacity === 1 ? "bed" : "beds"} free`;
      return {
        value: room.id,
        label: `Room ${room.number} · ${beds}`,
        disabled: !current && free <= 0,
      };
    });

  return (
    <CareForm
      form={form}
      hidden={{ resident_id: resident.id }}
      submitLabel="Save details"
      pendingLabel="Saving…"
    >
      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="first_name"
          label="First name"
          autoComplete="off"
          defaultValue={resident.first_name}
          errors={form.errors.first_name}
        />
        <TextField
          name="last_name"
          label="Last name"
          autoComplete="off"
          defaultValue={resident.last_name}
          errors={form.errors.last_name}
        />
        <TextField
          name="date_of_birth"
          label="Date of birth"
          type="date"
          defaultValue={resident.date_of_birth}
          max={today}
          errors={form.errors.date_of_birth}
        />
        <SelectField
          name="sex"
          label="Sex"
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
          ]}
          defaultValue={resident.sex}
          errors={form.errors.sex}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TextField
          name="admission_date"
          label="Admitted on"
          type="date"
          defaultValue={resident.admission_date}
          max={today}
          errors={form.errors.admission_date}
        />
        <SelectField
          name="status"
          label="Status"
          options={optionsFrom(RESIDENT_STATUS_LABELS)}
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value as Enums<"resident_status">)}
          errors={form.errors.status}
        />
        {former && (
          <>
            <TextField
              name="stay_ended_on"
              label="Stay ended on"
              type="date"
              defaultValue={resident.stay_ended_on ?? today}
              max={today}
              errors={form.errors.stay_ended_on}
            />
            <SelectField
              name="stay_end_reason"
              label="How it ended"
              placeholder="Choose a reason"
              options={optionsFrom(STAY_END_REASON_LABELS)}
              defaultValue={resident.stay_end_reason ?? ""}
              errors={form.errors.stay_end_reason}
            />
          </>
        )}
        <SelectField
          name="unit_id"
          label="Unit"
          options={placement.units.map((unit) => ({ value: unit.id, label: unit.name }))}
          value={unitId}
          onChange={(event) => {
            setUnitId(event.currentTarget.value);
            setRoomId("");
          }}
          errors={form.errors.unit_id}
        />
        <SelectField
          name="room_id"
          label="Room"
          placeholder="No room"
          options={roomOptions}
          value={former ? "" : roomId}
          onChange={(event) => setRoomId(event.currentTarget.value)}
          disabled={former}
          description={former ? "A former resident holds no room." : undefined}
          errors={form.errors.room_id}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          name="code_status"
          label="Code status"
          options={optionsFrom(CODE_STATUS_LABELS)}
          defaultValue={resident.code_status}
          errors={form.errors.code_status}
        />
        <SelectField
          name="diet"
          label="Diet"
          options={optionsFrom(DIET_LABELS)}
          defaultValue={resident.diet}
          errors={form.errors.diet}
        />
        <SelectField
          name="mobility"
          label="Mobility"
          options={optionsFrom(MOBILITY_LABELS)}
          defaultValue={resident.mobility}
          errors={form.errors.mobility}
        />
      </div>
    </CareForm>
  );
}

export function EditResidentDetailsButton({
  resident,
  placement,
}: {
  resident: ResidentDirectoryEntry;
  placement: PlacementOptions;
}) {
  return (
    <RecordSheetButton
      label="Edit details"
      icon={Pencil}
      title="Edit resident details"
      description="Demographics, the stay, the room, and care facts. Changes show on the page as soon as they are saved."
      wide
    >
      {(close) => <ResidentDetailsForm resident={resident} placement={placement} onDone={close} />}
    </RecordSheetButton>
  );
}
