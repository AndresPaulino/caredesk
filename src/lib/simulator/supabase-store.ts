/**
 * The store over the hosted project. Reads go through one service-role client; every write
 * goes through a client for the acting nurse whose requests carry the `x-caredesk-actor`
 * header, so the audit trigger attributes the change to that nurse (docs/database.md) and the
 * feed shows a name, not a system account. The service role is not subject to policies, so
 * the plausibility rules in `actions.ts` are what keep a nurse on their own units.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  SimulatedAdministration,
  SimulatedNurse,
  SimulatedOrder,
  SimulatedResident,
  SimulatorStore,
  UnitSnapshot,
  WriteResult,
} from "./types";

import type { Database } from "../supabase/database.types";

type Client = SupabaseClient<Database>;

export type SupabaseStoreOptions = { url: string; secretKey: string };

/** Administrations this recent decide which doses are still outstanding. */
const ADMINISTRATION_LOOKBACK_MS = 26 * 3_600_000;
/** The latest set of vitals is looked for this far back... */
const VITALS_LOOKBACK_MS = 48 * 3_600_000;
/** ...and the latest weight, taken weekly, this far. */
const WEIGHT_LOOKBACK_MS = 21 * 24 * 3_600_000;
/** PostgREST caps a response at this many rows; longer lists are read in pages. */
const PAGE_SIZE = 1000;

function serviceClient(options: SupabaseStoreOptions, headers: Record<string, string> = {}) {
  return createClient<Database>(options.url, options.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

export type NurseRoster = SimulatedNurse & {
  /** "Willowbrook Meadows, Units A and B", for the command's banner. */
  where: string;
};

/** The simulated nurses on the staff, with the units they cover. */
export async function loadSimulatedNurses(options: SupabaseStoreOptions): Promise<NurseRoster[]> {
  const client = serviceClient(options);
  const staff = await client
    .from("staff")
    .select("id, first_name, last_name, credentials, facility_id")
    .eq("is_simulated", true)
    .eq("role", "nurse")
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");
  if (staff.error) throw new Error(`Could not load the simulated staff: ${staff.error.message}`);
  const ids = staff.data.map((member) => member.id);
  const [assignments, facilities] = await Promise.all([
    client
      .from("staff_unit_assignments")
      .select("staff_id, unit_id, units(code, name)")
      .in("staff_id", ids),
    client.from("facilities").select("id, name"),
  ]);
  if (assignments.error) {
    throw new Error(`Could not load unit assignments: ${assignments.error.message}`);
  }
  if (facilities.error) throw new Error(`Could not load facilities: ${facilities.error.message}`);
  const facilityName = new Map(facilities.data.map((facility) => [facility.id, facility.name]));

  return staff.data.flatMap((member) => {
    if (!member.facility_id) return [];
    const mine = assignments.data
      .filter((assignment) => assignment.staff_id === member.id)
      .sort((a, b) => (a.units?.code ?? "").localeCompare(b.units?.code ?? ""));
    const codes = mine.map((assignment) => assignment.units?.code ?? "?");
    const units =
      codes.length > 1
        ? `Units ${codes.slice(0, -1).join(", ")} and ${codes.at(-1)}`
        : `Unit ${codes[0] ?? "?"}`;
    return [
      {
        id: member.id,
        first_name: member.first_name,
        last_name: member.last_name,
        credentials: member.credentials,
        facility_id: member.facility_id,
        unit_ids: mine.map((assignment) => assignment.unit_id),
        where: `${facilityName.get(member.facility_id) ?? member.facility_id}, ${units}`,
      },
    ];
  });
}

export function createSupabaseStore(options: SupabaseStoreOptions): SimulatorStore {
  const reader = serviceClient(options);
  const writers = new Map<string, Client>();
  const writerFor = (nurse: SimulatedNurse) => {
    let client = writers.get(nurse.id);
    if (!client) {
      client = serviceClient(options, { "x-caredesk-actor": nurse.id });
      writers.set(nurse.id, client);
    }
    return client;
  };

  return {
    async loadUnits(unitIds, now): Promise<UnitSnapshot> {
      const ids = [...unitIds];
      const [units, rooms, residents] = await Promise.all([
        reader
          .from("units")
          .select("id, facility_id, code, name")
          .in("id", ids)
          .is("archived_at", null),
        reader
          .from("rooms")
          .select("id, unit_id, number, capacity")
          .in("unit_id", ids)
          .is("archived_at", null),
        reader
          .from("residents")
          .select(
            "id, first_name, last_name, sex, date_of_birth, admission_date, status, facility_id, unit_id, room_id, diet, mobility, code_status",
          )
          .in("unit_id", ids)
          .eq("status", "current")
          .is("archived_at", null),
      ]);
      if (units.error) throw new Error(`Could not load units: ${units.error.message}`);
      if (rooms.error) throw new Error(`Could not load rooms: ${rooms.error.message}`);
      if (residents.error) throw new Error(`Could not load residents: ${residents.error.message}`);

      const facilityIds = [...new Set(units.data.map((unit) => unit.facility_id))];
      const residentIds = residents.data.map((resident) => resident.id);
      const at = now.getTime();
      const [facilities, conditions, orders, administrations, vitals, weights] = await Promise.all([
        reader.from("facilities").select("id, name, city").in("id", facilityIds),
        pageAll((from, to) =>
          reader
            .from("conditions")
            .select("resident_id, code")
            .in("resident_id", residentIds)
            .is("resolved_on", null)
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        ),
        pageAll((from, to) =>
          reader
            .from("medication_orders")
            .select("id, resident_id, medication, frequency, status, started_on")
            .in("resident_id", residentIds)
            .eq("status", "active")
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        ),
        pageAll((from, to) =>
          reader
            .from("administrations")
            .select("resident_id, medication_order_id, administered_at")
            .in("resident_id", residentIds)
            .gte("administered_at", new Date(at - ADMINISTRATION_LOOKBACK_MS).toISOString())
            .is("archived_at", null)
            .order("id")
            .range(from, to),
        ),
        pageAll((from, to) =>
          reader
            .from("vitals")
            .select(
              "resident_id, taken_at, systolic, diastolic, pulse, temperature_f, respiratory_rate, oxygen_saturation, weight_lb",
            )
            .in("resident_id", residentIds)
            .gte("taken_at", new Date(at - VITALS_LOOKBACK_MS).toISOString())
            .is("archived_at", null)
            .order("taken_at", { ascending: false })
            .range(from, to),
        ),
        pageAll((from, to) =>
          reader
            .from("vitals")
            .select("resident_id, taken_at, weight_lb")
            .in("resident_id", residentIds)
            .not("weight_lb", "is", null)
            .gte("taken_at", new Date(at - WEIGHT_LOOKBACK_MS).toISOString())
            .is("archived_at", null)
            .order("taken_at", { ascending: false })
            .range(from, to),
        ),
      ]);
      if (facilities.error) {
        throw new Error(`Could not load facilities: ${facilities.error.message}`);
      }

      const codesByResident = groupBy(conditions, (row) => row.resident_id);
      const ordersByResident = groupBy(orders, (row) => row.resident_id);
      const administrationsByResident = groupBy(administrations, (row) => row.resident_id);
      const latestVitals = new Map<string, (typeof vitals)[number]>();
      for (const set of vitals) {
        if (!latestVitals.has(set.resident_id)) latestVitals.set(set.resident_id, set);
      }
      const latestWeight = new Map<string, number>();
      for (const set of weights) {
        if (!latestWeight.has(set.resident_id) && set.weight_lb != null) {
          latestWeight.set(set.resident_id, set.weight_lb);
        }
      }

      return {
        facilities: facilities.data,
        units: units.data,
        rooms: rooms.data,
        residents: residents.data.map((row): SimulatedResident => {
          const latest = latestVitals.get(row.id);
          return {
            ...row,
            sex: row.sex === "male" ? "male" : "female",
            condition_codes: (codesByResident.get(row.id) ?? []).map((c) => c.code),
            orders: (ordersByResident.get(row.id) ?? []).map((order): SimulatedOrder => ({
              id: order.id,
              medication: order.medication,
              frequency: order.frequency,
              status: order.status,
              started_on: order.started_on,
            })),
            administrations: (administrationsByResident.get(row.id) ?? []).map(
              (administration): SimulatedAdministration => ({
                medication_order_id: administration.medication_order_id,
                administered_at: administration.administered_at,
              }),
            ),
            latest_vitals: latest
              ? {
                  systolic: latest.systolic,
                  diastolic: latest.diastolic,
                  pulse: latest.pulse,
                  temperature_f: latest.temperature_f,
                  respiratory_rate: latest.respiratory_rate,
                  oxygen_saturation: latest.oxygen_saturation,
                  weight_lb: latest.weight_lb ?? latestWeight.get(row.id) ?? null,
                  taken_at: latest.taken_at,
                }
              : null,
          };
        }),
      };
    },

    async apply(nurse, action): Promise<WriteResult> {
      const client = writerFor(nurse);
      const resident_id = action.resident.id;
      switch (action.kind) {
        case "vitals":
          return inserted(
            client
              .from("vitals")
              .insert({ resident_id, taken_by: nurse.id, ...action.row })
              .select("id")
              .single(),
          );
        case "administration":
          return inserted(
            client
              .from("administrations")
              .insert({ resident_id, administered_by: nurse.id, ...action.row })
              .select("id")
              .single(),
          );
        case "note":
          return inserted(
            client
              .from("progress_notes")
              .insert({ resident_id, written_by: nurse.id, ...action.row })
              .select("id")
              .single(),
          );
        case "incident":
          return inserted(
            client
              .from("incidents")
              .insert({ resident_id, reported_by: nurse.id, ...action.row })
              .select("id")
              .single(),
          );
        case "appointment":
          return inserted(
            client
              .from("appointments")
              .insert({ resident_id, scheduled_by: nurse.id, ...action.row })
              .select("id")
              .single(),
          );
        case "resident_update": {
          const { data, error } = await client
            .from("residents")
            .update(action.changes)
            .eq("id", resident_id)
            .eq("status", "current")
            .is("archived_at", null)
            .select("id");
          if (error) return { ok: false, message: describeError(error) };
          return data[0]
            ? { ok: true, id: data[0].id }
            : { ok: false, message: "The resident is no longer a current resident" };
        }
      }
    },
  };
}

type Failure = { message: string; hint?: string | null; code?: string };

function describeError(error: Failure): string {
  return error.hint ? `${error.message} (${error.hint})` : error.message;
}

async function inserted(
  query: PromiseLike<{ data: { id: string } | null; error: Failure | null }>,
): Promise<WriteResult> {
  const { data, error } = await query;
  if (error) return { ok: false, message: describeError(error) };
  if (!data) return { ok: false, message: "The insert returned no row" };
  return { ok: true, id: data.id };
}

/** Reads a whole result set a page at a time, past PostgREST's per-response row cap. */
async function pageAll<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: Failure | null }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load records: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

function groupBy<Row>(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}
