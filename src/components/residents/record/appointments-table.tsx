"use client";

import { CalendarClock } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { APPOINTMENT_KIND_LABELS, APPOINTMENT_STATUS_LABELS } from "@/lib/clinical/labels";
import { formatShortDateTime, formatStaffName } from "@/lib/format";
import type { ClinicalRecord } from "@/lib/residents/clinical-record";

import { useMemo } from "react";

import { AppointmentRowActions, ScheduleAppointmentButton } from "../care/appointment-form";
import { RecordEmpty, RecordPanel, WrappedText } from "./record-panel";

type Appointment = ClinicalRecord["appointments"][number];

const helper = createDataTableColumnHelper<Appointment>();

const columns = helper.columns([
  helper.accessor("scheduled_at", {
    id: "scheduled",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Scheduled" />,
    cell: ({ getValue }) => formatShortDateTime(getValue()),
  }),
  helper.accessor("kind", {
    id: "kind",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
    cell: ({ getValue }) => APPOINTMENT_KIND_LABELS[getValue()],
  }),
  helper.accessor("location", {
    id: "location",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Location" />,
    cell: ({ getValue }) => <WrappedText className="max-w-xs min-w-40">{getValue()}</WrappedText>,
  }),
  helper.accessor("purpose", {
    id: "purpose",
    header: "Purpose",
    enableSorting: false,
    cell: ({ getValue }) => (
      <WrappedText className="max-w-md min-w-48 text-muted-foreground">{getValue()}</WrappedText>
    ),
  }),
  helper.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ getValue }) => {
      const status = getValue();
      const variant =
        status === "scheduled" ? "secondary" : status === "completed" ? "outline" : "ghost";
      return <Badge variant={variant}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>;
    },
  }),
  helper.accessor((row) => formatStaffName(row.staff) ?? "", {
    id: "scheduler",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Scheduled by" />,
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
]);

function actionsColumn(residentId: string) {
  return helper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <AppointmentRowActions residentId={residentId} appointment={row.original} />
      </div>
    ),
  });
}

export function AppointmentsTable({
  residentId,
  appointments,
  canRecord,
}: {
  residentId: string;
  appointments: Appointment[];
  canRecord: boolean;
}) {
  const allColumns = useMemo(() => [...columns, actionsColumn(residentId)], [residentId]);

  return (
    <RecordPanel
      title="Appointments"
      description="Visits outside the facility, upcoming first, then past ones."
      actions={canRecord && <ScheduleAppointmentButton residentId={residentId} />}
    >
      {appointments.length === 0 ? (
        <RecordEmpty
          icon={CalendarClock}
          title="No appointments"
          description="No outside visit has been scheduled for this resident."
        />
      ) : (
        <DataTable columns={allColumns} data={appointments} getRowId={(row) => row.id} />
      )}
    </RecordPanel>
  );
}
