/**
 * Seeded pseudo-random number generator using the mulberry32 algorithm.
 * All randomness in a battle flows through this class.
 *
 * Copied from BattleScript Online, bso-game-shared/src/combat/rng.ts,
 * unchanged but for this header. The hub issues the seed at the start of an
 * adventure; given the same seed and the same sequence of calls, this always
 * produces identical output.
 */
export class SeededRng {
  private state: number;

  constructor(seed: string) {
    this.state = SeededRng.hashSeed(seed);
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  }

  /** Returns an integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Shuffles an array in place using Fisher-Yates. */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = array[i] as T;
      array[i] = array[j] as T;
      array[j] = temp;
    }
    return array;
  }

  /** Picks one element from an array. */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error("Cannot pick from an empty array");
    }
    return array[this.nextInt(0, array.length - 1)] as T;
  }

  /** Hashes a string seed into a 32-bit integer. Uses djb2. */
  private static hashSeed(seed: string): number {
    let hash = 5381;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
  }
}
