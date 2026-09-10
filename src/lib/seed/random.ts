import { createHash } from "node:crypto";

/**
 * UUID v5 style id derived from a key, so the same key always yields the same id. Every seeded
 * row has one, which is what keeps links working after a reseed.
 */
export function stableId(key: string): string {
  const hash = createHash("sha1").update(`caredesk:${key}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type Random = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform real in [min, max). */
  real(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  /** Normally distributed, via Box-Muller. */
  normal(mean: number, standardDeviation: number): number;
  /** One item chosen in proportion to its weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** `count` distinct items, in random order. */
  sample<T>(items: readonly T[], count: number): T[];
  shuffle<T>(items: readonly T[]): T[];
  /**
   * A generator seeded from this one's seed and a key. Records for one resident come from a
   * derived generator, so adding data to one resident never reshuffles another.
   */
  derive(key: string): Random;
};

/** Deterministic PRNG (mulberry32) with the helpers the generator needs. */
export function createRandom(seed: number | string): Random {
  let state = (typeof seed === "number" ? seed : hashToInt(seed)) >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const random: Random = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    real: (min, max) => min + next() * (max - min),
    pick: (items) => {
      if (items.length === 0) throw new Error("Cannot pick from an empty list");
      return items[Math.floor(next() * items.length)];
    },
    chance: (probability) => next() < probability,
    normal: (mean, standardDeviation) => {
      const u = 1 - next();
      const v = next();
      return mean + standardDeviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    weighted: (items, weight) => {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      if (!(total > 0)) throw new Error("Cannot pick from items with no weight");
      let remaining = next() * total;
      for (const item of items) {
        remaining -= weight(item);
        if (remaining < 0) return item;
      }
      return items[items.length - 1];
    },
    sample: (items, count) => random.shuffle(items).slice(0, count),
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    derive: (key) => createRandom(`${seed}:${key}`),
  };
  return random;
}

function hashToInt(text: string): number {
  return createHash("sha1").update(text).digest().readUInt32BE(0);
}
