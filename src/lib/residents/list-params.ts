import { z } from "zod";

import { residentFocusKeys, type ResidentFocusKey } from "./focus";

/**
 * The resident list is driven entirely by the URL, so a filtered list can be linked to (the
 * dashboard tiles link to a focus) and the browser's back button works.
 */

export const RESIDENT_PAGE_SIZE = 25;

export const residentStatusFilters = ["current", "former", "all"] as const;
export const residentSortKeys = ["name", "room", "facility", "admission"] as const;
export const sortDirections = ["asc", "desc"] as const;

export type ResidentStatusFilter = (typeof residentStatusFilters)[number];
export type ResidentSortKey = (typeof residentSortKeys)[number];
export type SortDirection = (typeof sortDirections)[number];

const uuid = z.uuid();

const residentListParamsSchema = z.object({
  /** A dashboard tile's residents, from `src/lib/residents/focus.ts`. */
  focus: z.enum(residentFocusKeys).optional().catch(undefined),
  q: z.string().trim().max(80).catch("").default(""),
  facility: uuid.optional().catch(undefined),
  unit: uuid.optional().catch(undefined),
  status: z.enum(residentStatusFilters).catch("current").default("current"),
  sort: z.enum(residentSortKeys).catch("name").default("name"),
  dir: z.enum(sortDirections).catch("asc").default("asc"),
  page: z.coerce.number().int().min(1).catch(1).default(1),
});

export type ResidentListParams = z.output<typeof residentListParamsSchema> & {
  focus?: ResidentFocusKey;
};

export const DEFAULT_RESIDENT_LIST_PARAMS: ResidentListParams = residentListParamsSchema.parse({});

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Reads the list state from `searchParams`. Anything malformed falls back to its default. */
export function parseResidentListParams(raw: RawSearchParams): ResidentListParams {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return residentListParamsSchema.parse({
    focus: first(raw.focus) || undefined,
    q: first(raw.q),
    facility: first(raw.facility) || undefined,
    unit: first(raw.unit) || undefined,
    status: first(raw.status),
    sort: first(raw.sort),
    dir: first(raw.dir),
    page: first(raw.page),
  });
}

/** Builds `/residents?...` for a set of params, leaving defaults out of the URL. */
export function residentListHref(
  params: ResidentListParams,
  overrides: Partial<ResidentListParams> = {},
): string {
  const merged = { ...params, ...overrides };
  const search = new URLSearchParams();
  if (merged.focus) search.set("focus", merged.focus);
  if (merged.q) search.set("q", merged.q);
  if (merged.facility) search.set("facility", merged.facility);
  if (merged.unit) search.set("unit", merged.unit);
  if (merged.status !== DEFAULT_RESIDENT_LIST_PARAMS.status) search.set("status", merged.status);
  if (merged.sort !== DEFAULT_RESIDENT_LIST_PARAMS.sort) search.set("sort", merged.sort);
  if (merged.dir !== DEFAULT_RESIDENT_LIST_PARAMS.dir) search.set("dir", merged.dir);
  if (merged.page > 1) search.set("page", String(merged.page));
  const query = search.toString();
  return query ? `/residents?${query}` : "/residents";
}
