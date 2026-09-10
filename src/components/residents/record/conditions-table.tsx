"use client";

import { HeartPulse } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";

import { RecordEmpty, RecordPanel, WrappedText } from "./record-panel";

type Condition = Tables<"conditions">;

const helper = createDataTableColumnHelper<Condition>();

const columns = helper.columns([
  helper.accessor("description", {
    id: "condition",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Condition" />,
    cell: ({ row }) => (
      <WrappedText>
        <span className="font-medium">{row.original.description}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {row.original.code_system} {row.original.code}
        </span>
      </WrappedText>
    ),
  }),
  helper.accessor("onset_date", {
    id: "onset",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Onset" />,
    cell: ({ getValue }) => formatDate(getValue()),
  }),
  helper.accessor("resolved_on", {
    id: "resolved",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Resolved" />,
    cell: ({ getValue }) => {
      const value = getValue();
      return value ? formatDate(value) : <span className="text-muted-foreground">—</span>;
    },
  }),
  helper.display({
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.resolved_on ? (
        <Badge variant="outline">Resolved</Badge>
      ) : (
        <Badge variant="secondary">Active</Badge>
      ),
  }),
]);

export function ConditionsTable({ conditions }: { conditions: Condition[] }) {
  return (
    <RecordPanel title="Conditions" description="Active diagnoses first, then resolved ones.">
      {conditions.length === 0 ? (
        <RecordEmpty
          icon={HeartPulse}
          title="No conditions on record"
          description="No diagnosis has been recorded for this resident."
        />
      ) : (
        <DataTable columns={columns} data={conditions} getRowId={(row) => row.id} />
      )}
    </RecordPanel>
  );
}
