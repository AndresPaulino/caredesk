import type { Metadata } from "next";

import { PageHeader } from "@/components/app-shell/page-header";
import { ResidentFilters } from "@/components/residents/resident-filters";
import { ResidentTable } from "@/components/residents/resident-table";
import { requireStaff } from "@/lib/auth/current-staff";
import { focusFor } from "@/lib/residents/focus";
import { parseResidentListParams } from "@/lib/residents/list-params";
import { listResidents, listScopeOptions } from "@/lib/residents/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Residents" };

export default async function ResidentsPage(props: PageProps<"/residents">) {
  const staff = await requireStaff();
  const params = parseResidentListParams(await props.searchParams);
  const supabase = await createSupabaseServerClient();
  const [options, result] = await Promise.all([
    listScopeOptions(supabase),
    listResidents(supabase, params, new Date()),
  ]);
  const focus = params.focus ? focusFor(params.focus) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={focus ? focus.label : "Residents"}
        description={
          focus
            ? focus.description
            : staff.role === "admin"
              ? "Every resident across all facilities. Search by name or room, or narrow by facility, unit, and status."
              : `Your scope is ${staff.scopeDescription}. Residents outside it are not shown.`
        }
      />
      <ResidentFilters params={params} options={options} />
      <ResidentTable
        residents={result.residents}
        params={params}
        total={result.total}
        pageCount={result.pageCount}
      />
    </div>
  );
}
