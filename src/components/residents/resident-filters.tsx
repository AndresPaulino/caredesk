"use client";

import { LayoutDashboard, Search, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
import { focusFor } from "@/lib/residents/focus";
import {
  DEFAULT_RESIDENT_LIST_PARAMS,
  residentListHref,
  residentStatusFilters,
  type ResidentListParams,
} from "@/lib/residents/list-params";
import type { ScopeOptions } from "@/lib/residents/queries";

const STATUS_LABELS: Record<(typeof residentStatusFilters)[number], string> = {
  current: "Current residents",
  former: "Former residents",
  all: "Current and former",
};

/**
 * Search and filters for the resident list. Submitting navigates to the same route with the
 * state in the URL; changing a select submits on its own. The options are already scoped:
 * a nurse's list holds only their facility and units. A focus from a dashboard tile is shown
 * as a chip that the other filters narrow further; clearing it returns to the whole list.
 */
export function ResidentFilters({
  params,
  options,
}: {
  params: ResidentListParams;
  options: ScopeOptions;
}) {
  const [facility, setFacility] = useState(params.facility ?? "");
  const unitsShown = facility
    ? options.units.filter((unit) => unit.facilityId === facility)
    : options.units;
  const facilityName = (id: string) => options.facilities.find((f) => f.id === id)?.name ?? "";

  const focus = params.focus ? focusFor(params.focus) : null;
  const filtered =
    params.q !== "" ||
    params.facility !== undefined ||
    params.unit !== undefined ||
    params.status !== DEFAULT_RESIDENT_LIST_PARAMS.status;

  const submitOnChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <Form action="/residents" replace scroll={false} className="flex flex-wrap items-end gap-3">
      {focus && <input type="hidden" name="focus" value={focus.key} />}
      {params.sort !== DEFAULT_RESIDENT_LIST_PARAMS.sort && (
        <input type="hidden" name="sort" value={params.sort} />
      )}
      {params.dir !== DEFAULT_RESIDENT_LIST_PARAMS.dir && (
        <input type="hidden" name="dir" value={params.dir} />
      )}

      <div className="grid w-full gap-1.5 sm:w-72">
        <Label htmlFor="resident-search">Search</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="resident-search"
            name="q"
            type="search"
            placeholder="Name or room"
            defaultValue={params.q}
            className="pl-8"
          />
        </div>
      </div>

      {options.facilities.length > 1 && (
        <div className="grid gap-1.5">
          <Label htmlFor="resident-facility">Facility</Label>
          <NativeSelect
            id="resident-facility"
            name="facility"
            value={facility}
            onChange={(event) => {
              setFacility(event.currentTarget.value);
              submitOnChange(event);
            }}
          >
            <NativeSelectOption value="">All facilities</NativeSelectOption>
            {options.facilities.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      {options.units.length > 1 && (
        <div className="grid gap-1.5">
          <Label htmlFor="resident-unit">Unit</Label>
          <NativeSelect
            id="resident-unit"
            name="unit"
            key={facility}
            defaultValue={
              params.unit && unitsShown.some((unit) => unit.id === params.unit) ? params.unit : ""
            }
            onChange={submitOnChange}
          >
            <NativeSelectOption value="">All units</NativeSelectOption>
            {facility || options.facilities.length <= 1
              ? unitsShown.map((unit) => (
                  <NativeSelectOption key={unit.id} value={unit.id}>
                    {unit.name}
                  </NativeSelectOption>
                ))
              : options.facilities.map((item) => (
                  <NativeSelectOptGroup key={item.id} label={item.name}>
                    {unitsShown
                      .filter((unit) => unit.facilityId === item.id)
                      .map((unit) => (
                        <NativeSelectOption key={unit.id} value={unit.id}>
                          {unit.name}
                        </NativeSelectOption>
                      ))}
                  </NativeSelectOptGroup>
                ))}
          </NativeSelect>
        </div>
      )}

      {/* A focus is always current residents, so the status choice stays out of the way. */}
      {!focus && (
        <div className="grid gap-1.5">
          <Label htmlFor="resident-status">Status</Label>
          <NativeSelect
            id="resident-status"
            name="status"
            defaultValue={params.status}
            onChange={submitOnChange}
          >
            {residentStatusFilters.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {STATUS_LABELS[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            nativeButton={false}
            render={
              <Link
                href={residentListHref(DEFAULT_RESIDENT_LIST_PARAMS, { focus: params.focus })}
              />
            }
          >
            <X data-icon="inline-start" aria-hidden />
            Clear
          </Button>
        )}
      </div>

      {focus && (
        <div className="flex basis-full items-center gap-2 text-sm">
          <Badge variant="secondary">
            <LayoutDashboard aria-hidden />
            From the dashboard: {focus.label.toLowerCase()}
          </Badge>
          <Link
            href="/residents"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Show all residents
          </Link>
        </div>
      )}
      {facility && options.facilities.length > 1 && (
        <span className="sr-only">Showing {facilityName(facility)}</span>
      )}
    </Form>
  );
}
