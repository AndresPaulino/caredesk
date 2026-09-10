"use client";

import { ShieldAlert, TriangleAlert } from "lucide-react";

import { DataTable, createDataTableColumnHelper } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { conflictsByAllergy, type AllergyConflict } from "@/lib/clinical/allergy-conflicts";
import {
  ALLERGY_CATEGORY_LABELS,
  ALLERGY_SEVERITY_LABELS,
  ALLERGY_TYPE_LABELS,
} from "@/lib/clinical/labels";
import type { AllergenOption } from "@/lib/care/vocabulary";
import { formatDate } from "@/lib/format";
import type { Tables } from "@/lib/supabase/database.types";
import { useMemo } from "react";

import { AddAllergyButton, AllergyRowActions } from "../care/allergy-form";
import { RecordEmpty, RecordPanel, WrappedText } from "./record-panel";

type Allergy = Tables<"allergies"> & { conflicts: AllergyConflict[] };

const helper = createDataTableColumnHelper<Allergy>();

const columns = helper.columns([
  helper.accessor("description", {
    id: "allergen",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Allergen" />,
    cell: ({ row }) => (
      <WrappedText>
        <span className="font-medium">{row.original.description}</span>
        {row.original.conflicts.length > 0 && (
          <Badge variant="destructive" className="ml-2 align-middle">
            <TriangleAlert aria-hidden />
            Conflicts with {row.original.conflicts.map((c) => c.medication).join(", ")}
          </Badge>
        )}
      </WrappedText>
    ),
  }),
  helper.accessor("category", {
    id: "category",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
    cell: ({ getValue }) => ALLERGY_CATEGORY_LABELS[getValue()],
  }),
  helper.accessor("allergy_type", {
    id: "type",
    header: "Type",
    enableSorting: false,
    cell: ({ getValue }) => ALLERGY_TYPE_LABELS[getValue()],
  }),
  helper.accessor("reaction", {
    id: "reaction",
    header: "Reaction",
    enableSorting: false,
    cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("severity", {
    id: "severity",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Severity" />,
    cell: ({ getValue }) => {
      const severity = getValue();
      if (!severity) return <span className="text-muted-foreground">—</span>;
      const variant =
        severity === "severe" ? "destructive" : severity === "moderate" ? "secondary" : "outline";
      return <Badge variant={variant}>{ALLERGY_SEVERITY_LABELS[severity]}</Badge>;
    },
  }),
  helper.accessor("noted_on", {
    id: "noted",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Noted on" />,
    cell: ({ getValue }) => formatDate(getValue()),
  }),
]);

function actionsColumn(residentId: string) {
  return helper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <AllergyRowActions residentId={residentId} allergy={row.original} />
      </div>
    ),
  });
}

export function AllergiesTable({
  residentId,
  allergies,
  conflicts,
  allergens,
}: {
  residentId: string;
  allergies: Tables<"allergies">[];
  conflicts: AllergyConflict[];
  allergens: readonly AllergenOption[];
}) {
  const conflictsFor = conflictsByAllergy(conflicts);
  const rows: Allergy[] = allergies.map((allergy) => ({
    ...allergy,
    conflicts: conflictsFor.get(allergy.id) ?? [],
  }));
  const allColumns = useMemo(() => [...columns, actionsColumn(residentId)], [residentId]);

  return (
    <RecordPanel
      title="Allergies"
      description="Documented allergies and intolerances. A medication allergy that an active order names is flagged."
      actions={<AddAllergyButton residentId={residentId} allergens={allergens} />}
    >
      {rows.length === 0 ? (
        <RecordEmpty
          icon={ShieldAlert}
          title="No known allergies"
          description="No allergy or intolerance has been documented for this resident."
        />
      ) : (
        <DataTable columns={allColumns} data={rows} getRowId={(row) => row.id} />
      )}
    </RecordPanel>
  );
}
