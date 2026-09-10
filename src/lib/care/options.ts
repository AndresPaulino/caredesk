import "server-only";

import { formatStaffName } from "@/lib/format";

import type { CareClient } from "./record";

/**
 * What the forms offer to choose from, read through the caller's session so the choices are
 * already within scope: a nurse sees the physicians at their facility and the units and rooms
 * they cover; an admin sees a facility's whole staff and floor plan.
 */

export type PhysicianOption = { id: string; name: string };

export async function listPhysicians(
  supabase: CareClient,
  facilityId: string,
): Promise<PhysicianOption[]> {
  const { data, error } = await supabase
    .from("staff")
    .select("id, first_name, last_name, credentials")
    .eq("role", "physician")
    .eq("facility_id", facilityId)
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");
  if (error) throw new Error(`Could not load physicians: ${error.message}`);
  return data.map((member) => ({ id: member.id, name: formatStaffName(member) ?? member.id }));
}

export type UnitOption = { id: string; code: string; name: string };

export type RoomOption = {
  id: string;
  unitId: string;
  number: string;
  capacity: number;
  /** Current residents in the room right now. A bed is free while this is below capacity. */
  occupied: number;
};

export type PlacementOptions = { units: UnitOption[]; rooms: RoomOption[] };

/** The units of a facility the caller can see, and their rooms with today's occupancy. */
export async function listPlacementOptions(
  supabase: CareClient,
  facilityId: string,
): Promise<PlacementOptions> {
  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id, code, name")
    .eq("facility_id", facilityId)
    .is("archived_at", null)
    .order("code");
  if (unitsError) throw new Error(`Could not load units: ${unitsError.message}`);
  const unitIds = units.map((unit) => unit.id);

  const [rooms, occupants] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, unit_id, number, capacity")
      .in("unit_id", unitIds)
      .is("archived_at", null),
    supabase
      .from("residents")
      .select("room_id")
      .in("unit_id", unitIds)
      .eq("status", "current")
      .is("archived_at", null)
      .not("room_id", "is", null),
  ]);
  if (rooms.error) throw new Error(`Could not load rooms: ${rooms.error.message}`);
  if (occupants.error) throw new Error(`Could not load occupancy: ${occupants.error.message}`);

  const occupiedByRoom = new Map<string, number>();
  for (const resident of occupants.data) {
    if (!resident.room_id) continue;
    occupiedByRoom.set(resident.room_id, (occupiedByRoom.get(resident.room_id) ?? 0) + 1);
  }

  return {
    units,
    rooms: rooms.data
      .map((room) => ({
        id: room.id,
        unitId: room.unit_id,
        number: room.number,
        capacity: room.capacity,
        occupied: occupiedByRoom.get(room.id) ?? 0,
      }))
      .sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true })),
  };
}
