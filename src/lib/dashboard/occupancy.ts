/**
 * The census tile's chart: beds and residents per facility for an admin, per unit for a
 * nurse, whose scope is one facility. Pure, so the server groups and the chart only draws.
 */

export type OccupancyRow = {
  unit_id: string;
  unit_name: string;
  facility_id: string;
  facility_name: string;
  beds: number;
  residents: number;
};

export type OccupancyGroup = {
  id: string;
  label: string;
  beds: number;
  residents: number;
  /** Residents per bed, 0 to 1 (or above, if a bed count is stale). */
  occupancy: number;
};

export function groupOccupancy(
  rows: readonly OccupancyRow[],
  by: "facility" | "unit",
): OccupancyGroup[] {
  const groups = new Map<string, OccupancyGroup>();
  for (const row of rows) {
    const id = by === "facility" ? row.facility_id : row.unit_id;
    const label = by === "facility" ? row.facility_name : row.unit_name;
    const group = groups.get(id) ?? { id, label, beds: 0, residents: 0, occupancy: 0 };
    group.beds += row.beds;
    group.residents += row.residents;
    groups.set(id, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    occupancy: group.beds > 0 ? group.residents / group.beds : 0,
  }));
}

/** "94%" */
export function formatOccupancy(occupancy: number): string {
  return `${Math.round(occupancy * 100)}%`;
}
