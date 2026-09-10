/**
 * The simulator's path into the hosted project: every kind of action lands through the
 * service role in a simulated nurse's name, the audit trigger records each as that nurse, and
 * the loop runs a few rounds with nothing rejected. Skipped without `.env.local`. Puts every
 * row back when it is done, with the same audit skip flag the seeder uses.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createRandom } from "../seed/random";

import { planAction } from "./actions";
import { createSimulator } from "./simulator";
import { createSupabaseStore, loadSimulatedNurses, type NurseRoster } from "./supabase-store";
import {
  ACTION_KINDS,
  TABLE_FOR_ACTION,
  type ResidentChanges,
  type SimulatorStore,
  type WrittenTable,
} from "./types";

import type { Database } from "../supabase/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const hostedProject = Boolean(url && secretKey && !url.includes("placeholder"));

type Client = SupabaseClient<Database>;

type Written = {
  table: WrittenTable;
  id: string;
  residentId: string;
  nurseId: string;
  operation: "insert" | "update";
  before?: ResidentChanges;
};

describe.skipIf(!hostedProject)("the simulator on the hosted project", () => {
  let nurses: NurseRoster[];
  let store: SimulatorStore;
  /** The service role with auditing skipped, for the cleanup. */
  let unaudited: Client;
  let startedAt: string;
  const written: Written[] = [];

  beforeAll(async () => {
    const options = { url: url!, secretKey: secretKey! };
    nurses = await loadSimulatedNurses(options);
    store = createSupabaseStore(options);
    unaudited = createClient<Database>(url!, secretKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-caredesk-audit": "skip" } },
    });
    startedAt = new Date().toISOString();
  });

  afterAll(async () => {
    if (!unaudited) return;
    for (const row of written) {
      if (row.table === "residents") {
        await unaudited.from("residents").update(row.before!).eq("id", row.id);
      } else {
        await unaudited.from(row.table).delete().eq("id", row.id);
      }
    }
    await unaudited
      .from("audit_events")
      .delete()
      .in(
        "record_id",
        written.map((row) => row.id),
      )
      .gte("occurred_at", startedAt);
  });

  it("finds the ten simulated nurses, each with units at their own facility", () => {
    expect(nurses).toHaveLength(10);
    expect(new Set(nurses.map((nurse) => nurse.facility_id)).size).toBe(6);
    for (const nurse of nurses) {
      expect(nurse.unit_ids.length).toBeGreaterThan(0);
      expect(nurse.where).toMatch(/^Willowbrook \w+, Units? /);
    }
  });

  it("writes every kind of action as a simulated nurse, and the trail records that nurse", async () => {
    const random = createRandom(8);
    const now = new Date();
    for (const kind of ACTION_KINDS) {
      let applied = false;
      for (const nurse of nurses) {
        const snapshot = await store.loadUnits(nurse.unit_ids, now);
        for (const resident of snapshot.residents) {
          expect(resident.status).toBe("current");
          expect(nurse.unit_ids).toContain(resident.unit_id);
        }
        const action = planAction(kind, nurse, snapshot, now, random);
        if (!action) continue;
        const result = await store.apply(nurse, action);
        expect(result).toMatchObject({ ok: true });
        if (!result.ok) throw new Error(result.message);
        written.push({
          table: TABLE_FOR_ACTION[kind],
          id: result.id,
          residentId: action.resident.id,
          nurseId: nurse.id,
          operation: kind === "resident_update" ? "update" : "insert",
          before: action.kind === "resident_update" ? action.before : undefined,
        });
        applied = true;
        break;
      }
      // A scheduled dose is due only around its time; the pass may have nothing to give.
      if (kind === "administration" && !applied) {
        console.warn(`No simulated nurse had a dose to give at ${now.toISOString()}`);
        continue;
      }
      expect(applied, `a plausible ${kind}`).toBe(true);
    }

    const { data: events, error } = await unaudited
      .from("audit_events")
      .select("record_id, table_name, actor_id, operation, resident_id")
      .in(
        "record_id",
        written.map((row) => row.id),
      )
      .gte("occurred_at", startedAt);
    expect(error).toBeNull();
    for (const row of written) {
      const event = events!.find((e) => e.record_id === row.id && e.table_name === row.table);
      expect(event, `an audit event for the ${row.table} row`).toMatchObject({
        actor_id: row.nurseId,
        operation: row.operation,
        resident_id: row.residentId,
      });
    }
  });

  it("runs a few rounds of the loop with nothing rejected", async () => {
    const simulator = createSimulator({
      store,
      nurses,
      random: createRandom(9),
      onStep: (result) => {
        if (result.status !== "done") return;
        written.push({
          table: result.table,
          id: result.id,
          residentId: result.action.resident.id,
          nurseId: result.nurse.id,
          operation: result.action.kind === "resident_update" ? "update" : "insert",
          before: result.action.kind === "resident_update" ? result.action.before : undefined,
        });
      },
    });
    for (let i = 0; i < 5; i++) {
      const result = await simulator.step();
      expect(result.status).toBe("done");
      if (result.status !== "done") continue;
      expect(result.nurse.unit_ids).toContain(result.action.resident.unit_id);
      expect(result.summary).toMatch(/\w/);
      expect(result.place).toMatch(/^\w+ [A-D]$/);
    }
    expect(simulator.summary()).toMatchObject({ steps: 5, done: 5, rejected: 0, errors: 0 });
  });
});
