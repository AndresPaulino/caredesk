/**
 * A store over plain arrays, for the tests: it hands back every resident on a unit whatever
 * their status, so the plausibility rules are what keep the simulator honest, and it feeds
 * the simulator's own writes back into the next snapshot, so a dose given is no longer due.
 */
import type {
  AdministrationRecord,
  AppointmentRecord,
  IncidentRecord,
  PlannedAction,
  ProgressNoteRecord,
  SimulatedFacility,
  SimulatedNurse,
  SimulatedResident,
  SimulatedRoom,
  SimulatedUnit,
  SimulatorStore,
  UnitSnapshot,
  VitalsRecord,
  WriteResult,
} from "./types";

export type MemoryStoreState = {
  facilities: SimulatedFacility[];
  units: SimulatedUnit[];
  rooms: SimulatedRoom[];
  residents: SimulatedResident[];
};

type Written<Row> = Row & { id: string; resident_id: string; actor_id: string };

export type MemoryStore = SimulatorStore & {
  residents: SimulatedResident[];
  vitals: Written<VitalsRecord>[];
  administrations: Written<AdministrationRecord>[];
  progress_notes: Written<ProgressNoteRecord>[];
  incidents: Written<IncidentRecord>[];
  appointments: Written<AppointmentRecord>[];
  /** Every write that was accepted, in order. */
  writes: Array<{ nurse: SimulatedNurse; action: PlannedAction; id: string }>;
  /** Makes the next write fail with this message, the way a policy or trigger would. */
  failNext(message: string): void;
};

const ADMINISTRATION_LOOKBACK_MS = 26 * 3_600_000;

export function createMemoryStore(state: MemoryStoreState): MemoryStore {
  const residents = state.residents.map((resident) => ({
    ...resident,
    condition_codes: [...resident.condition_codes],
    orders: [...resident.orders],
    administrations: [...resident.administrations],
  }));
  const failures: string[] = [];
  let sequence = 0;

  const store: MemoryStore = {
    residents,
    vitals: [],
    administrations: [],
    progress_notes: [],
    incidents: [],
    appointments: [],
    writes: [],
    failNext: (message) => {
      failures.push(message);
    },

    async loadUnits(unitIds, now): Promise<UnitSnapshot> {
      const since = now.getTime() - ADMINISTRATION_LOOKBACK_MS;
      return {
        facilities: state.facilities,
        units: state.units.filter((unit) => unitIds.includes(unit.id)),
        rooms: state.rooms.filter((room) => unitIds.includes(room.unit_id)),
        residents: residents
          .filter((resident) => unitIds.includes(resident.unit_id))
          .map((resident) => {
            const written = store.vitals
              .filter((set) => set.resident_id === resident.id)
              .sort((a, b) => b.taken_at.localeCompare(a.taken_at));
            const latest = written[0] ?? resident.latest_vitals;
            return {
              ...resident,
              administrations: [
                ...resident.administrations,
                ...store.administrations
                  .filter((row) => row.resident_id === resident.id)
                  .map((row) => ({
                    medication_order_id: row.medication_order_id,
                    administered_at: row.administered_at,
                  })),
              ].filter((row) => Date.parse(row.administered_at) >= since),
              latest_vitals: latest
                ? {
                    systolic: latest.systolic,
                    diastolic: latest.diastolic,
                    pulse: latest.pulse,
                    temperature_f: latest.temperature_f,
                    respiratory_rate: latest.respiratory_rate,
                    oxygen_saturation: latest.oxygen_saturation,
                    weight_lb:
                      latest.weight_lb ??
                      written.find((set) => set.weight_lb != null)?.weight_lb ??
                      resident.latest_vitals?.weight_lb ??
                      null,
                    taken_at: latest.taken_at,
                  }
                : null,
            };
          }),
      };
    },

    async apply(nurse, action): Promise<WriteResult> {
      const failure = failures.shift();
      if (failure) return { ok: false, message: failure };
      const id = `write-${++sequence}`;
      const stamp = { id, resident_id: action.resident.id, actor_id: nurse.id };
      switch (action.kind) {
        case "vitals":
          store.vitals.push({ ...action.row, ...stamp });
          break;
        case "administration":
          store.administrations.push({ ...action.row, ...stamp });
          break;
        case "note":
          store.progress_notes.push({ ...action.row, ...stamp });
          break;
        case "incident":
          store.incidents.push({ ...action.row, ...stamp });
          break;
        case "appointment":
          store.appointments.push({ ...action.row, ...stamp });
          break;
        case "resident_update": {
          const resident = residents.find((candidate) => candidate.id === action.resident.id);
          if (!resident) return { ok: false, message: "The resident was not found" };
          Object.assign(resident, action.changes);
          break;
        }
      }
      store.writes.push({ nurse, action, id });
      return { ok: true, id: action.kind === "resident_update" ? action.resident.id : id };
    },
  };
  return store;
}
