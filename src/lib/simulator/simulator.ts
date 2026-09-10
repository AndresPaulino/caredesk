/**
 * The loop: pick a nurse, look at their units, try the kinds of action the hour calls for
 * until one is plausible, write it in the nurse's name, wait, repeat. `step()` does one round
 * and never sleeps, which is what the tests drive with a fake clock; `run()` is the live loop
 * the command uses, stopped by a signal or a deadline.
 */
import { formatStaffName } from "../format";
import { createRandom, type Random } from "../seed/random";

import { describeAction, planAction } from "./actions";
import { actionOrder, nextIntervalMs } from "./rhythm";
import {
  ACTION_KINDS,
  TABLE_FOR_ACTION,
  type ActionKind,
  type PlannedAction,
  type SimulatedNurse,
  type SimulatorStore,
  type UnitSnapshot,
  type WrittenTable,
} from "./types";

export type Clock = () => Date;
export type Wait = (ms: number, signal?: AbortSignal) => Promise<void>;

type StepBase = {
  at: Date;
  nurse: SimulatedNurse;
  /** "Nadia Roy, RN". */
  nurseName: string;
};

export type StepResult =
  | (StepBase & {
      status: "done";
      action: PlannedAction;
      table: WrittenTable;
      id: string;
      summary: string;
      /** "Meadows B": the resident's facility and unit. */
      place: string;
    })
  | (StepBase & {
      status: "rejected";
      action: PlannedAction;
      table: WrittenTable;
      message: string;
      summary: string;
      place: string;
    })
  | (StepBase & { status: "idle"; reason: string });

export type SimulatorSummary = {
  startedAt: Date;
  stoppedAt: Date;
  steps: number;
  done: number;
  rejected: number;
  idle: number;
  /** Rounds that threw (the store could not be reached, say), as opposed to rejected writes. */
  errors: number;
  byKind: Record<ActionKind, number>;
};

export type SimulatorOptions = {
  store: SimulatorStore;
  nurses: readonly SimulatedNurse[];
  /** The source of every choice; seed it to replay a run. */
  random?: Random;
  clock?: Clock;
  /** 1 is real time; 10 is ten times faster. */
  pace?: number;
  wait?: Wait;
  onStep?: (result: StepResult) => void;
  onError?: (error: unknown) => void;
};

export type Simulator = {
  step(): Promise<StepResult>;
  run(options?: { signal?: AbortSignal; until?: Date }): Promise<SimulatorSummary>;
  summary(): SimulatorSummary;
};

/** Sleeps, or returns early when the signal fires. */
export const realWait: Wait = (ms, signal) =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });

/** After an error, how long to wait before trying again. */
const RETRY_MS = 10_000;

export function createSimulator(options: SimulatorOptions): Simulator {
  const { store, nurses, onStep, onError } = options;
  if (nurses.length === 0) throw new Error("The simulator needs at least one simulated nurse");
  const random = options.random ?? createRandom(Date.now());
  const clock = options.clock ?? (() => new Date());
  const pace = options.pace ?? 1;
  const wait = options.wait ?? realWait;
  if (!(pace > 0)) throw new Error(`The pace must be a positive number, got ${pace}`);

  const startedAt = clock();
  const counts = { steps: 0, done: 0, rejected: 0, idle: 0, errors: 0 };
  const byKind = Object.fromEntries(ACTION_KINDS.map((kind) => [kind, 0])) as Record<
    ActionKind,
    number
  >;

  const summary = (): SimulatorSummary => ({ startedAt, stoppedAt: clock(), ...counts, byKind });

  async function step(): Promise<StepResult> {
    const at = clock();
    const nurse = random.pick(nurses);
    const base: StepBase = { at, nurse, nurseName: formatStaffName(nurse) ?? nurse.id };
    counts.steps += 1;

    const snapshot = await store.loadUnits(nurse.unit_ids, at);
    for (const kind of actionOrder(random, at)) {
      const action = planAction(kind, nurse, snapshot, at, random);
      if (!action) continue;
      const table = TABLE_FOR_ACTION[kind];
      const summaryText = describeAction(action, snapshot);
      const place = placeOf(action, snapshot);
      const written = await store.apply(nurse, action);
      const result: StepResult = written.ok
        ? { ...base, status: "done", action, table, id: written.id, summary: summaryText, place }
        : {
            ...base,
            status: "rejected",
            action,
            table,
            message: written.message,
            summary: summaryText,
            place,
          };
      if (written.ok) {
        counts.done += 1;
        byKind[kind] += 1;
      } else {
        counts.rejected += 1;
      }
      onStep?.(result);
      return result;
    }

    const idle: StepResult = {
      ...base,
      status: "idle",
      reason: "nothing plausible to record on their units right now",
    };
    counts.idle += 1;
    onStep?.(idle);
    return idle;
  }

  async function run({ signal, until }: { signal?: AbortSignal; until?: Date } = {}) {
    while (!signal?.aborted && !(until && clock() >= until)) {
      let delay: number;
      try {
        await step();
        delay = nextIntervalMs(random, clock(), pace);
      } catch (error) {
        counts.errors += 1;
        onError?.(error);
        delay = RETRY_MS;
      }
      const remaining = until ? until.getTime() - clock().getTime() : Number.POSITIVE_INFINITY;
      if (remaining <= 0) break;
      await wait(Math.min(delay, remaining), signal);
    }
    return summary();
  }

  return { step, run, summary };
}

/** "Meadows B": the resident's facility, without the operator's name, and unit. */
function placeOf(action: PlannedAction, snapshot: UnitSnapshot): string {
  const unit = snapshot.units.find((candidate) => candidate.id === action.resident.unit_id);
  const facility = snapshot.facilities.find(
    (candidate) => candidate.id === action.resident.facility_id,
  );
  const facilityName = facility?.name.replace(/^Willowbrook\s+/, "") ?? "?";
  return `${facilityName} ${unit?.code ?? "?"}`;
}
