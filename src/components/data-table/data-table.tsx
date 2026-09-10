"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type OnChangeFn,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The shadcn data table pattern (ADR 0004) on TanStack Table v9: column definitions render
 * through the shared `Table` primitives, with sorting either in the browser or, for lists the
 * server pages, delegated to the caller through `manualSorting` and `onSortingChange`.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

export type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, unknown>;

/** Column helper bound to the table's feature set, for typed accessor and display columns. */
export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTableProps<TData extends RowData> = {
  columns: ReadonlyArray<DataTableColumn<TData>>;
  data: TData[];
  getRowId: (row: TData) => string;
  /** Controlled sorting state. Omit to let the table sort in the browser. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** True when the caller sorts the data itself (for example on the server). */
  manualSorting?: boolean;
  /** Makes each row clickable. The row still needs a real link in one cell for accessibility. */
  onRowClick?: (row: TData) => void;
  /** Rendered in place of the body when there are no rows. */
  emptyState?: React.ReactNode;
  className?: string;
};

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  sorting,
  onSortingChange,
  manualSorting = false,
  onRowClick,
  emptyState = "No results.",
  className,
}: DataTableProps<TData>) {
  const table = useTable({
    features: dataTableFeatures,
    columns: columns as Array<DataTableColumn<TData>>,
    data,
    getRowId,
    manualSorting,
    ...(sorting ? { state: { sorting } } : {}),
    onSortingChange,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table>
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="h-32 text-center whitespace-normal">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
