"use client";

import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { UserSearch } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ageOn, formatDate } from "@/lib/format";
import {
  RESIDENT_PAGE_SIZE,
  residentListHref,
  residentSortKeys,
  type ResidentListParams,
  type ResidentSortKey,
} from "@/lib/residents/list-params";
import type { ResidentFlag } from "@/lib/clinical/flags";
import type { ResidentDirectoryEntry } from "@/lib/residents/queries";

import { ResidentFlags } from "./resident-flags";
import { ResidentStatusBadge } from "./resident-status-badge";

/** A directory row with its wristband flags, computed on the server for this page. */
type ResidentRow = ResidentDirectoryEntry & { flags: ResidentFlag[] };

const helper = createDataTableColumnHelper<ResidentRow>();

// Column ids double as the sort keys in the URL.
const columns = helper.columns([
  helper.accessor("last_name", {
    id: "name" satisfies ResidentSortKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Resident" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-willow-100 text-xs font-bold text-willow-900"
        >
          {row.original.first_name[0]}
          {row.original.last_name[0]}
        </span>
        <Link
          href={`/residents/${row.original.id}`}
          className="font-medium hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.original.last_name}, {row.original.first_name}
        </Link>
      </div>
    ),
  }),
  helper.accessor("room_number", {
    id: "room" satisfies ResidentSortKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Room" />,
    cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("unit_name", {
    id: "unit",
    header: "Unit",
    enableSorting: false,
  }),
  helper.accessor("flags", {
    id: "flags",
    header: "Flags",
    enableSorting: false,
    cell: ({ getValue }) =>
      getValue().length === 0 ? (
        <span className="text-muted-foreground">None</span>
      ) : (
        <ResidentFlags flags={getValue()} compact className="flex-nowrap" />
      ),
  }),
  helper.accessor("facility_name", {
    id: "facility" satisfies ResidentSortKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Facility" />,
  }),
  helper.accessor("date_of_birth", {
    id: "age",
    header: "Age",
    enableSorting: false,
    cell: ({ getValue }) => ageOn(getValue()),
  }),
  helper.accessor("admission_date", {
    id: "admission" satisfies ResidentSortKey,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Admitted" />,
    cell: ({ getValue }) => formatDate(getValue()),
  }),
  helper.accessor("status", {
    id: "status",
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => (
      <ResidentStatusBadge
        status={row.original.status}
        stayEndReason={row.original.stay_end_reason}
      />
    ),
  }),
]);

/** The scoped resident list: server-sorted and server-paged, with the state in the URL. */
export function ResidentTable({
  residents,
  flags,
  showFacility,
  params,
  total,
  pageCount,
}: {
  residents: ResidentDirectoryEntry[];
  /** Flags per resident id. */
  flags: Record<string, ResidentFlag[]>;
  /** A nurse's scope is one facility, so the column would repeat one name on every row. */
  showFacility: boolean;
  params: ResidentListParams;
  total: number;
  pageCount: number;
}) {
  const router = useRouter();
  const rows = useMemo<ResidentRow[]>(
    () => residents.map((resident) => ({ ...resident, flags: flags[resident.id] ?? [] })),
    [residents, flags],
  );
  const shownColumns = useMemo(
    () => (showFacility ? columns : columns.filter((column) => column.id !== "facility")),
    [showFacility],
  );

  const sorting = useMemo<SortingState>(
    () => [{ id: params.sort, desc: params.dir === "desc" }],
    [params.sort, params.dir],
  );

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const sort = residentSortKeys.find((key) => key === first?.id) ?? "name";
    router.push(residentListHref(params, { sort, dir: first?.desc ? "desc" : "asc", page: 1 }));
  };

  return (
    <div className="space-y-3">
      <DataTable
        columns={shownColumns}
        data={rows}
        getRowId={(resident) => resident.id}
        sorting={sorting}
        onSortingChange={onSortingChange}
        manualSorting
        onRowClick={(resident) => router.push(`/residents/${resident.id}`)}
        emptyState={
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserSearch aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No residents match</EmptyTitle>
              <EmptyDescription>
                Try a different name or room, or clear the filters. Residents outside your scope
                never appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      <DataTablePagination
        page={params.page}
        pageCount={pageCount}
        pageSize={RESIDENT_PAGE_SIZE}
        total={total}
        hrefForPage={(page) => residentListHref(params, { page })}
        noun="residents"
      />
    </div>
  );
}
