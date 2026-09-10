import { describe, expect, it } from "vitest";

import { createRandom } from "../seed/random";

import {
  BASE_INTERVAL_MS,
  RHYTHM,
  actionOrder,
  bandAt,
  hourInZone,
  nextIntervalMs,
} from "./rhythm";
import { ACTION_KINDS, type ActionKind } from "./types";

/** An instant at a wall-clock hour on September 10, 2026, Eastern (EDT, UTC-4). */
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, 10, hour + 4, minute) - (hour + 4 >= 24 ? 0 : 0));

function firstChoices(instant: Date, draws = 3000): Record<ActionKind, number> {
  const random = createRandom(`rhythm:${instant.toISOString()}`);
  const counts = Object.fromEntries(ACTION_KINDS.map((kind) => [kind, 0])) as Record<
    ActionKind,
    number
  >;
  for (let i = 0; i < draws; i++) counts[actionOrder(random, instant)[0]] += 1;
  return counts;
}

const likeliest = (counts: Record<ActionKind, number>) =>
  ACTION_KINDS.reduce((best, kind) => (counts[kind] > counts[best] ? kind : best));

describe("the shift rhythm", () => {
  it("covers every hour of the day with one band, in the facilities' time zone", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(hourInZone(at(hour))).toBe(hour);
      expect(RHYTHM.filter((band) => band.name === bandAt(at(hour)).name)).toHaveLength(1);
    }
    expect(bandAt(at(3)).name).toBe("night");
    expect(bandAt(at(5, 59)).name).toBe("night");
    expect(bandAt(at(6)).name).toBe("morning");
    expect(bandAt(at(12)).name).toBe("midday");
    expect(bandAt(at(16)).name).toBe("afternoon");
    expect(bandAt(at(21)).name).toBe("evening");
    expect(bandAt(at(23)).name).toBe("night");
  });

  it("weights vitals in the morning, administrations midday, notes in the afternoon", () => {
    expect(likeliest(firstChoices(at(8, 30)))).toBe("vitals");
    expect(likeliest(firstChoices(at(13)))).toBe("administration");
    expect(likeliest(firstChoices(at(16)))).toBe("note");
    expect(likeliest(firstChoices(at(20)))).toBe("administration");
  });

  it("is quiet overnight: mostly notes and checks, and no paperwork at all", () => {
    const night = firstChoices(at(3));
    expect(likeliest(night)).toBe("note");
    expect(night.resident_update).toBe(0);
    expect(night.appointment).toBe(0);
    const random = createRandom(1);
    for (let i = 0; i < 200; i++) {
      const order = actionOrder(random, at(2));
      expect(order).not.toContain("resident_update");
      expect(order).not.toContain("appointment");
      // Every kind with weight is tried, likeliest first, each once.
      expect(new Set(order).size).toBe(order.length);
      expect(order).toHaveLength(4);
    }
    expect(actionOrder(random, at(10))).toHaveLength(ACTION_KINDS.length);
  });

  it("keeps incidents rare at every hour", () => {
    for (const hour of [3, 9, 13, 16, 21]) {
      const counts = firstChoices(at(hour));
      expect(counts.incident / 3000).toBeLessThan(0.05);
    }
  });

  it("waits 30 to 90 seconds by day at pace 1, less at a faster pace, longer at night", () => {
    const random = createRandom(2);
    const [min, max] = BASE_INTERVAL_MS;
    for (let i = 0; i < 500; i++) {
      const day = nextIntervalMs(random, at(10), 1);
      expect(day).toBeGreaterThanOrEqual(min);
      expect(day).toBeLessThanOrEqual(max);
      const fast = nextIntervalMs(random, at(10), 10);
      expect(fast).toBeGreaterThanOrEqual(min / 10);
      expect(fast).toBeLessThanOrEqual(max / 10);
      const night = nextIntervalMs(random, at(3), 1);
      expect(night).toBeGreaterThanOrEqual(min / 0.4 - 1);
      expect(night).toBeLessThanOrEqual(max / 0.4 + 1);
    }
    expect(() => nextIntervalMs(random, at(10), 0)).toThrow(/positive/);
  });
});
