/**
 * The engine, in spike form.
 *
 * The real engine is adapted from BattleScript Online (architecture overview,
 * "Engine provenance"). For the spike it is one deterministic function: given
 * the seed the hub issued at start, produce the rewards an adventure yields.
 * What the spike proves is the sharing: this package is imported by the hub,
 * the verifier and the Angular client, and all three get the same answer for
 * the same seed.
 */

export type Material = "timber" | "ore" | "cloth";

export const MATERIALS: readonly Material[] = ["timber", "ore", "cloth"];

export interface Reward {
  material: Material;
  amount: number;
}

/** A small, fast, seedable PRNG (mulberry32). Deterministic across runtimes. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed is a string in the records; the engine works on a number. */
export function seedToNumber(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Rewards for an adventure, a pure function of its seed. */
export function rewardsForSeed(seed: string): Reward[] {
  const next = rng(seedToNumber(seed));
  return MATERIALS.map((material) => ({
    material,
    amount: 1 + Math.floor(next() * 5),
  })).filter((r) => r.amount > 1);
}
