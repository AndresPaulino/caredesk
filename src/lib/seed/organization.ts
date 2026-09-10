/**
 * The operator's shape: six facilities, four units each, thirty rooms per unit (ten of them
 * semi-private), and the staff who work there: the three demo accounts, two physicians and
 * eight nurses per facility, ten of the nurses flagged as simulated staff for the simulator.
 */
import { DEMO_ACCOUNTS } from "../demo-accounts";

import { stableId, type Random } from "./random";
import type { SeedRow, SeedStaffMember } from "./types";
import { NAME_POOLS } from "./vocabulary";

export const UNIT_CODES = ["A", "B", "C", "D"] as const;
export const ROOMS_PER_UNIT = 30;
export const DOUBLE_ROOMS_PER_UNIT = 10;
export const PHYSICIANS_PER_FACILITY = 2;
export const NURSES_PER_FACILITY = 8;
export const SIMULATED_STAFF_COUNT = 10;

export const FACILITIES: ReadonlyArray<Pick<SeedRow<"facilities">, "code" | "name" | "city">> = [
  { code: "MDW", name: "Willowbrook Meadows", city: "Concord" },
  { code: "HBR", name: "Willowbrook Harbor", city: "Gloucester" },
  { code: "PNS", name: "Willowbrook Pines", city: "Lenox" },
  { code: "ORC", name: "Willowbrook Orchard", city: "Northampton" },
  { code: "CMN", name: "Willowbrook Commons", city: "Worcester" },
  { code: "BAY", name: "Willowbrook Bayview", city: "Falmouth" },
];

/** Lowercase ASCII from a name, for email addresses: "Víctor O'Neil" becomes "victoroneil". */
export function asciiSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]/gi, "")
    .toLowerCase();
}

export type Organization = {
  facilities: SeedRow<"facilities">[];
  units: SeedRow<"units">[];
  rooms: SeedRow<"rooms">[];
  staff: SeedStaffMember[];
  assignments: SeedRow<"staff_unit_assignments">[];
  unitsByFacility: Map<string, SeedRow<"units">[]>;
  roomsByUnit: Map<string, SeedRow<"rooms">[]>;
  nursesByUnit: Map<string, SeedStaffMember[]>;
  physiciansByFacility: Map<string, SeedStaffMember[]>;
};

export function buildOrganization(random: Random): Organization {
  const facilities: SeedRow<"facilities">[] = FACILITIES.map((facility) => ({
    id: stableId(`facility:${facility.code}`),
    ...facility,
    state: "MA",
  }));

  const units: SeedRow<"units">[] = [];
  const rooms: SeedRow<"rooms">[] = [];
  const unitsByFacility = new Map<string, SeedRow<"units">[]>();
  const roomsByUnit = new Map<string, SeedRow<"rooms">[]>();

  for (const facility of facilities) {
    const facilityUnits: SeedRow<"units">[] = [];
    UNIT_CODES.forEach((code, unitIndex) => {
      const unit: SeedRow<"units"> = {
        id: stableId(`unit:${facility.code}:${code}`),
        facility_id: facility.id,
        code,
        name: `Unit ${code}`,
      };
      units.push(unit);
      facilityUnits.push(unit);
      const unitRooms: SeedRow<"rooms">[] = [];
      for (let n = 1; n <= ROOMS_PER_UNIT; n++) {
        const number = String((unitIndex + 1) * 100 + n);
        unitRooms.push({
          id: stableId(`room:${facility.code}:${code}:${number}`),
          unit_id: unit.id,
          number,
          capacity: n <= DOUBLE_ROOMS_PER_UNIT ? 2 : 1,
        });
      }
      rooms.push(...unitRooms);
      roomsByUnit.set(unit.id, unitRooms);
    });
    unitsByFacility.set(facility.id, facilityUnits);
  }

  const facilityByCode = new Map(facilities.map((facility) => [facility.code, facility]));
  const staff: SeedStaffMember[] = [];
  const usedNames = new Set<string>();

  // The three demo accounts come first, defined once in src/lib/demo-accounts.ts.
  for (const account of DEMO_ACCOUNTS) {
    const facility = account.facilityCode ? facilityByCode.get(account.facilityCode) : null;
    if (account.facilityCode && !facility)
      throw new Error(`Unknown facility ${account.facilityCode}`);
    const facilityUnits = facility ? unitsByFacility.get(facility.id)! : [];
    usedNames.add(`${account.firstName} ${account.lastName}`);
    staff.push({
      id: stableId(`staff:${account.key}`),
      auth_user_id: null,
      facility_id: facility?.id ?? null,
      role: account.role,
      first_name: account.firstName,
      last_name: account.lastName,
      credentials: account.credentials,
      email: account.email,
      is_simulated: false,
      unit_ids: account.unitCodes.map((code) => {
        const unit = facilityUnits.find((candidate) => candidate.code === code);
        if (!unit) throw new Error(`Unknown unit ${code} at ${account.facilityCode}`);
        return unit.id;
      }),
      account,
    });
  }

  const staffRandom = random.derive("staff");
  const newName = (sex: "female" | "male") => {
    for (;;) {
      const first = staffRandom.pick(sex === "female" ? NAME_POOLS.female : NAME_POOLS.male);
      const last = staffRandom.pick(NAME_POOLS.last);
      const full = `${first} ${last}`;
      if (!usedNames.has(full)) {
        usedNames.add(full);
        return { first, last };
      }
    }
  };
  const emailFor = (first: string, last: string) =>
    asciiSlug(`${first}.${last}`) + "@willowbrook.example";

  let simulatedLeft = SIMULATED_STAFF_COUNT;
  for (const facility of facilities) {
    const facilityUnits = unitsByFacility.get(facility.id)!;
    for (let i = 0; i < PHYSICIANS_PER_FACILITY; i++) {
      const sex = staffRandom.chance(0.5) ? "female" : "male";
      const { first, last } = newName(sex);
      staff.push({
        id: stableId(`staff:${facility.code}:physician:${i}`),
        auth_user_id: null,
        facility_id: facility.id,
        role: "physician",
        first_name: first,
        last_name: last,
        credentials: staffRandom.pick(["MD", "MD", "DO"]),
        email: emailFor(first, last),
        is_simulated: false,
        unit_ids: [],
        account: null,
      });
    }
    for (let i = 0; i < NURSES_PER_FACILITY; i++) {
      const sex = staffRandom.chance(0.8) ? "female" : "male";
      const { first, last } = newName(sex);
      // Two nurses per unit, each also covering the neighboring unit, so every unit has staff
      // to attribute records to and the simulator has people at every facility.
      const primary = facilityUnits[i % facilityUnits.length];
      const secondary = facilityUnits[(i + 1) % facilityUnits.length];
      const simulated = simulatedLeft > 0 && i < 2;
      if (simulated) simulatedLeft -= 1;
      staff.push({
        id: stableId(`staff:${facility.code}:nurse:${i}`),
        auth_user_id: null,
        facility_id: facility.id,
        role: "nurse",
        first_name: first,
        last_name: last,
        credentials: staffRandom.pick(["RN", "RN", "LPN"]),
        email: emailFor(first, last),
        is_simulated: simulated,
        unit_ids: staffRandom.chance(0.6) ? [primary.id, secondary.id] : [primary.id],
        account: null,
      });
    }
  }

  const assignments: SeedRow<"staff_unit_assignments">[] = staff.flatMap((member) =>
    member.unit_ids.map((unit_id) => ({ staff_id: member.id, unit_id })),
  );

  const nursesByUnit = new Map<string, SeedStaffMember[]>();
  for (const unit of units) nursesByUnit.set(unit.id, []);
  for (const member of staff) {
    if (member.role !== "nurse") continue;
    for (const unitId of member.unit_ids) nursesByUnit.get(unitId)!.push(member);
  }

  const physiciansByFacility = new Map<string, SeedStaffMember[]>();
  for (const facility of facilities) {
    physiciansByFacility.set(
      facility.id,
      staff.filter((member) => member.role === "physician" && member.facility_id === facility.id),
    );
  }

  return {
    facilities,
    units,
    rooms,
    staff,
    assignments,
    unitsByFacility,
    roomsByUnit,
    nursesByUnit,
    physiciansByFacility,
  };
}
