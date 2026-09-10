/**
 * The simulator (ticket 08): simulated nurses record care on a shift rhythm so the demo has
 * movement. `createSimulator` is the loop, pure over a store; `createSupabaseStore` is the
 * store the command runs it over; `createMemoryStore` is the one the tests use.
 */
export {
  describeAction,
  dueDoses,
  eligibleResidents,
  freeRooms,
  nextVitals,
  planAction,
  residentContext,
} from "./actions";
export { createMemoryStore, type MemoryStore, type MemoryStoreState } from "./memory-store";
export { RHYTHM, actionOrder, bandAt, hourInZone, nextIntervalMs } from "./rhythm";
export {
  createSimulator,
  realWait,
  type Clock,
  type Simulator,
  type SimulatorOptions,
  type SimulatorSummary,
  type StepResult,
  type Wait,
} from "./simulator";
export {
  createSupabaseStore,
  loadSimulatedNurses,
  type NurseRoster,
  type SupabaseStoreOptions,
} from "./supabase-store";
export * from "./types";
