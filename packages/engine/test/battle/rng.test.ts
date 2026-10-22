import { describe, expect, it } from "vitest";
import { SeededRng } from "../../src/index.js";

describe("SeededRng", () => {
  it("produces the same sequence for the same seed", () => {
    const a = new SeededRng("seed");
    const b = new SeededRng("seed");
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it("produces a different sequence for a different seed", () => {
    expect(new SeededRng("one").next()).not.toBe(new SeededRng("two").next());
  });

  it("keeps nextInt within its inclusive bounds", () => {
    const rng = new SeededRng("bounds");
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const n = rng.nextInt(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it("refuses to pick from an empty array", () => {
    expect(() => new SeededRng("x").pick([])).toThrow();
  });

  it("shuffles into a permutation", () => {
    expect(new SeededRng("x").shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
