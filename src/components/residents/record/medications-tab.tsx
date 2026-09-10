"use client";

import { Pill, TriangleAlert } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { conflictsByOrder, type AllergyConflict } from "@/lib/clinical/allergy-conflicts";
import {
  ADMINISTRATION_STATUS_LABELS,
  MEDICATION_ORDER_STATUS_LABELS,
} from "@/lib/clinical/labels";
import { MEDICATION_FREQUENCY_LABELS } from "@/lib/clinical/medication-schedule";
import { formatDate, formatShortDateTime, formatStaffName } from "@/lib/format";
import type { ClinicalRecord } from "@/lib/residents/clinical-record";
import { useMemo } from "react";

import {
  AddMedicationOrderButton,
  OrderRowActions,
  type MedicationOrderFormOptions,
} from "../care/medication-order-form";
import { RecordEmpty, RecordPanel, WrappedText } from "./record-panel";

type Order = ClinicalRecord["medication_orders"][number] & { conflicts: AllergyConflict[] };
type Administration = ClinicalRecord["administrations"][number] & { medication: string };

const orderHelper = createDataTableColumnHelper<Order>();

const orderColumns = orderHelper.columns([
  orderHelper.accessor("medication", {
    id: "medication",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Medication" />,
    cell: ({ row }) => (
      <WrappedText>
        <span className="font-medium">{row.original.medication}</span>
        {row.original.conflicts.length > 0 && (
          <Badge variant="destructive" className="ml-2 align-middle">
            <TriangleAlert aria-hidden />
            Allergy conflict: {row.original.conflicts.map((c) => c.allergy).join(", ")}
          </Badge>
        )}
        {row.original.instructions && (
          <span className="block text-xs text-muted-foreground">{row.original.instructions}</span>
        )}
      </WrappedText>
    ),
  }),
  orderHelper.accessor("frequency", {
    id: "frequency",
    header: "Frequency",
    enableSorting: false,
    cell: ({ getValue }) => MEDICATION_FREQUENCY_LABELS[getValue()],
  }),
  orderHelper.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) =>
      row.original.status === "active" ? (
        <Badge variant="secondary">{MEDICATION_ORDER_STATUS_LABELS.active}</Badge>
      ) : (
        <span className="text-muted-foreground">
          {MEDICATION_ORDER_STATUS_LABELS.discontinued}
          {row.original.ended_on && ` ${formatDate(row.original.ended_on)}`}
        </span>
      ),
  }),
  orderHelper.accessor("started_on", {
    id: "started",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Started" />,
    cell: ({ getValue }) => formatDate(getValue()),
  }),
  orderHelper.accessor((row) => formatStaffName(row.staff) ?? "", {
    id: "prescriber",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Prescribed by" />,
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
]);

/** Mark given, refused, held, or discontinue, on each active order. */
function orderActionsColumn(residentId: string) {
  return orderHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <OrderRowActions residentId={residentId} order={row.original} />,
  });
}

const administrationHelper = createDataTableColumnHelper<Administration>();

const administrationColumns = administrationHelper.columns([
  administrationHelper.accessor("administered_at", {
    id: "time",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
    cell: ({ getValue }) => formatShortDateTime(getValue()),
  }),
  administrationHelper.accessor("medication", {
    id: "medication",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Medication" />,
    cell: ({ getValue }) => <WrappedText className="max-w-md min-w-48">{getValue()}</WrappedText>,
  }),
  administrationHelper.accessor("status", {
    id: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ getValue }) => {
      const status = getValue();
      const variant =
        status === "given" ? "secondary" : status === "refused" ? "destructive" : "outline";
      return <Badge variant={variant}>{ADMINISTRATION_STATUS_LABELS[status]}</Badge>;
    },
  }),
  administrationHelper.accessor((row) => formatStaffName(row.staff) ?? "", {
    id: "by",
    header: ({ column }) => <DataTableColumnHeader column={column} title="By" />,
    cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span>,
  }),
  administrationHelper.accessor("notes", {
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

export function MedicationsTab({
  residentId,
  orders,
  administrations,
  conflicts,
  canRecord,
  formOptions,
}: {
  residentId: string;
  orders: ClinicalRecord["medication_orders"];
  administrations: ClinicalRecord["administrations"];
  conflicts: AllergyConflict[];
  /** False for a former resident, whose record takes no new care. */
  canRecord: boolean;
  formOptions: MedicationOrderFormOptions;
}) {
  const allOrderColumns = useMemo(
    () => (canRecord ? [...orderColumns, orderActionsColumn(residentId)] : orderColumns),
    [residentId, canRecord],
  );
  const conflictsFor = conflictsByOrder(conflicts);
  const orderRows: Order[] = orders.map((order) => ({
    ...order,
    conflicts: conflictsFor.get(order.id) ?? [],
  }));
  const medicationByOrder = new Map(orders.map((order) => [order.id, order.medication]));
  const administrationRows: Administration[] = administrations.map((administration) => ({
    ...administration,
    medication: medicationByOrder.get(administration.medication_order_id) ?? "Unknown order",
  }));

  return (
    <div className="space-y-8">
      <RecordPanel
        title="Medication orders"
        description="Active orders first. An order that names a documented allergen is flagged. Mark a dose given with one click."
        actions={
          canRecord && <AddMedicationOrderButton residentId={residentId} options={formOptions} />
        }
      >
        {orderRows.length === 0 ? (
          <RecordEmpty
            icon={Pill}
            title="No medication orders"
            description="No prescription has been recorded for this resident."
          />
        ) : (
          <DataTable columns={allOrderColumns} data={orderRows} getRowId={(row) => row.id} />
        )}
      </RecordPanel>

      <RecordPanel
        title="Administrations"
        description="The medication administration record: every dose given, refused, or held, newest first."
      >
        {administrationRows.length === 0 ? (
          <RecordEmpty
            icon={Pill}
            title="No administrations recorded"
            description="Nothing has been given, refused, or held yet."
          />
        ) : (
          <DataTable
            columns={administrationColumns}
            data={administrationRows}
            getRowId={(row) => row.id}
          />
        )}
      </RecordPanel>
    </div>
  );
}
