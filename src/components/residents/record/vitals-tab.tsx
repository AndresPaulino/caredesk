"use client";

import { Activity } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { outOfRangeReadings, type VitalReading } from "@/lib/clinical/vital-ranges";
import { formatShortDateTime, formatStaffName } from "@/lib/format";
import type { ClinicalRecord } from "@/lib/residents/clinical-record";
import { cn } from "@/lib/utils";

import { RecordEmpty, RecordPanel, WrappedText } from "./record-panel";
import { VitalsCharts } from "./vitals-chart";

type Vitals = ClinicalRecord["vitals"][number] & { outOfRange: VitalReading[] };

const helper = createDataTableColumnHelper<Vitals>();

/** A reading, in destructive ink when it falls outside its normal range. */
function Reading({
  row,
  reading,
  children,
}: {
  row: Vitals;
  reading: VitalReading;
  children: React.ReactNode;
}) {
  const flagged = row.outOfRange.includes(reading);
  return (
    <span className={cn("tabular-nums", flagged && "font-medium text-destructive")}>
      {children}
    </span>
  );
}

const columns = helper.columns([
  helper.accessor("taken_at", {
    id: "taken",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Taken" />,
    cell: ({ row }) => (
      <span className="flex flex-wrap items-center gap-2">
        {formatShortDateTime(row.original.taken_at)}
        {row.original.outOfRange.length > 0 && <Badge variant="destructive">Out of range</Badge>}
      </span>
    ),
  }),
  helper.accessor("systolic", {
    id: "bp",
    header: ({ column }) => <DataTableColumnHeader column={column} title="BP" />,
    cell: ({ row }) => (
      <>
        <Reading row={row.original} reading="systolic">
          {row.original.systolic}
        </Reading>
        /
        <Reading row={row.original} reading="diastolic">
          {row.original.diastolic}
        </Reading>
      </>
    ),
  }),
  helper.accessor("pulse", {
    id: "pulse",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Pulse" />,
    cell: ({ row }) => (
      <Reading row={row.original} reading="pulse">
        {row.original.pulse}
      </Reading>
    ),
  }),
  helper.accessor("temperature_f", {
    id: "temperature",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Temp °F" />,
    cell: ({ row }) => (
      <Reading row={row.original} reading="temperature_f">
        {row.original.temperature_f.toFixed(1)}
      </Reading>
    ),
  }),
  helper.accessor("respiratory_rate", {
    id: "respiration",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Resp" />,
    cell: ({ row }) => (
      <Reading row={row.original} reading="respiratory_rate">
        {row.original.respiratory_rate}
      </Reading>
    ),
  }),
  helper.accessor("oxygen_saturation", {
    id: "saturation",
    header: ({ column }) => <DataTableColumnHeader column={column} title="SpO₂" />,
    cell: ({ row }) => (
      <Reading row={row.original} reading="oxygen_saturation">
        {row.original.oxygen_saturation}%
      </Reading>
    ),
  }),
  helper.accessor("weight_lb", {
    id: "weight",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Weight lb" />,
    cell: ({ getValue }) => {
      const value = getValue();
      return value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="tabular-nums">{value.toFixed(1)}</span>
      );
    },
  }),
  helper.accessor((row) => formatStaffName(row.staff) ?? "", {
    id: "by",
    header: ({ column }) => <DataTableColumnHeader column={column} title="By" />,
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("notes", {
    id: "notes",
    header: "Notes",
    enableSorting: false,
    cell: ({ getValue }) => (
      <WrappedText className="max-w-md min-w-48 text-muted-foreground">
        {getValue() ?? ""}
      </WrappedText>
    ),
  }),
]);

export function VitalsTab({ vitals }: { vitals: ClinicalRecord["vitals"] }) {
  const rows: Vitals[] = vitals.map((set) => ({ ...set, outOfRange: outOfRangeReadings(set) }));

  return (
    <div className="space-y-6">
      {rows.length > 1 && <VitalsCharts vitals={rows} />}
      <RecordPanel
        title="Vitals"
        description="Every set of readings, newest first. A reading outside its normal range is marked."
      >
        {rows.length === 0 ? (
          <RecordEmpty
            icon={Activity}
            title="No vitals recorded"
            description="No set of readings has been taken for this resident."
          />
        ) : (
          <DataTable columns={columns} data={rows} getRowId={(row) => row.id} />
        )}
      </RecordPanel>
    </div>
  );
}
