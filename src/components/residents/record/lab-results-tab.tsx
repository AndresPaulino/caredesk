"use client";

import { FlaskConical } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatShortDateTime } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

import { LabTrendChart, describeRange, labTrends } from "./lab-trend-chart";
import { RecordEmpty, RecordPanel } from "./record-panel";

type LabResult = Tables<"lab_results">;

const helper = createDataTableColumnHelper<LabResult>();

const columns = helper.columns([
  helper.accessor("resulted_at", {
    id: "resulted",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Resulted" />,
    cell: ({ getValue }) => formatShortDateTime(getValue()),
  }),
  helper.accessor("description", {
    id: "test",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test" />,
    cell: ({ row }) => (
      <>
        <span className="font-medium">{row.original.description}</span>
        <span className="ml-2 text-xs text-muted-foreground">LOINC {row.original.code}</span>
      </>
    ),
  }),
  helper.accessor("value", {
    id: "result",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Result" />,
    cell: ({ row }) => (
      <span className={cn("tabular-nums", row.original.abnormal && "font-medium text-destructive")}>
        {row.original.value} {row.original.units}
      </span>
    ),
  }),
  helper.display({
    id: "range",
    header: "Reference",
    cell: ({ row }) => {
      const range = describeRange({
        referenceLow: row.original.reference_low,
        referenceHigh: row.original.reference_high,
      });
      return range ? (
        <span className="text-muted-foreground tabular-nums">
          {range} {row.original.units}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    },
  }),
  helper.accessor("abnormal", {
    id: "flag",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Flag" />,
    cell: ({ row }) => {
      if (!row.original.abnormal) return <span className="text-muted-foreground">Normal</span>;
      const high =
        row.original.reference_high !== null && row.original.value > row.original.reference_high;
      return <Badge variant="destructive">{high ? "High" : "Low"}</Badge>;
    },
  }),
]);

export function LabResultsTab({ labResults }: { labResults: LabResult[] }) {
  const trends = labTrends(labResults);

  return (
    <div className="space-y-6">
      {trends.length > 0 && <LabTrendChart trends={trends} />}
      <RecordPanel
        title="Lab results"
        description="Every resulted test, newest first, against its reference range."
      >
        {labResults.length === 0 ? (
          <RecordEmpty
            icon={FlaskConical}
            title="No lab results"
            description="No laboratory test has been resulted for this resident."
          />
        ) : (
          <DataTable columns={columns} data={labResults} getRowId={(row) => row.id} />
        )}
      </RecordPanel>
    </div>
  );
}
