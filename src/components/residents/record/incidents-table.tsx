"use client";

import { TriangleAlert } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { INCIDENT_KIND_LABELS } from "@/lib/clinical/labels";
import { formatShortDateTime, formatStaffName } from "@/lib/format";
import type { ClinicalRecord } from "@/lib/residents/clinical-record";

import { RecordEmpty, RecordPanel, WrappedText } from "./record-panel";

type Incident = ClinicalRecord["incidents"][number];

const helper = createDataTableColumnHelper<Incident>();

const columns = helper.columns([
  helper.accessor("occurred_at", {
    id: "occurred",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Occurred" />,
    cell: ({ getValue }) => formatShortDateTime(getValue()),
  }),
  helper.accessor("kind", {
    id: "kind",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Kind" />,
    cell: ({ row }) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline">{INCIDENT_KIND_LABELS[row.original.kind]}</Badge>
        {row.original.injury_sustained && <Badge variant="destructive">Injury</Badge>}
      </span>
    ),
  }),
  helper.accessor("description", {
    id: "description",
    header: "Description",
    enableSorting: false,
    cell: ({ getValue }) => (
      <WrappedText className="max-w-prose min-w-72">{getValue()}</WrappedText>
    ),
  }),
  helper.accessor((row) => formatStaffName(row.staff) ?? "", {
    id: "reporter",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Reported by" />,
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
]);

export function IncidentsTable({ incidents }: { incidents: Incident[] }) {
  return (
    <RecordPanel
      title="Incidents"
      description="Falls, medication errors, and behavioral events, newest first."
    >
      {incidents.length === 0 ? (
        <RecordEmpty
          icon={TriangleAlert}
          title="No incidents"
          description="No adverse event has been reported for this resident."
        />
      ) : (
        <DataTable columns={columns} data={incidents} getRowId={(row) => row.id} />
      )}
    </RecordPanel>
  );
}
