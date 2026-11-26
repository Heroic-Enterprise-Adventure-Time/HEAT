import { describe, expect, it } from "vitest";

import { dropRow, FACILITIES, JOBS, jobsPostedBy, must, RESOURCE_NODES, rollDrops, type SnapshotHero, warehouseCapacity } from "../../src/index.js";
import { haul, HIGHCRAG, party, played, QUARRY_FACE, QUARRY_GOBLINS, rewardOf, SEEDS } from "./helpers.js";

// Stone and the quarry (Issue-356, decision 0059): stone is mined at level 2
// alone, the first drop with no chance at its trait's first level, and the
// quarry at Highcrag posts the two jobs that bring it home. A villager's
// mining 1 brings home none, and a fighter or a knight, with no trait, none.

const outcrop = RESOURCE_NODES["stone-outcrop"];
const stone = must(outcrop.drops[0], "the outcrop's drop");

describe("stone", () => {
  it("is dropped by a stone outcrop of a vein's health and XP, to a party that mines", () => {
    expect(outcrop.health).toBe(RESOURCE_NODES["ore-vein"].health);
    expect(outcrop.xp).toBe(RESOURCE_NODES["ore-vein"].xp);
    expect(outcrop.drops).toHaveLength(1);
    expect(stone.material).toBe("stone");
    expect(stone.trait).toBe("mining");
  });

  it("has no chance at mining 1, and 20 to 24, always, at mining 2", () => {
    expect(dropRow(stone, 1)?.chancePercent).toBe(0);
    expect(dropRow(stone, 2)).toEqual({ chancePercent: 100, min: 20, max: 24 });
  });

  it(`drops nothing at mining 0 and at mining 1, and 20 to 24 at mining 2, for every one of ${SEEDS} outcrops`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const roll = (level: number) => rollDrops(`seed-${i}`, "outcrop-1", outcrop.drops, () => level);
      expect(roll(0), `seed-${i}`).toEqual([]);
      expect(roll(1), `seed-${i}`).toEqual([]);
      const [drop] = roll(2);
      expect(drop?.material, `seed-${i}`).toBe("stone");
      expect(drop?.amount, `seed-${i}`).toBeGreaterThanOrEqual(20);
      expect(drop?.amount, `seed-${i}`).toBeLessThanOrEqual(24);
    }
  });
});

describe("the quarry's jobs", () => {
  it("are the quarry's at Highcrag, the face first, and no other poster's", () => {
    expect(jobsPostedBy(HIGHCRAG, "quarry").map((j) => j.id)).toEqual([QUARRY_FACE, QUARRY_GOBLINS]);
    expect(FACILITIES.quarry.levels).toHaveLength(1);
    for (const id of [QUARRY_FACE, QUARRY_GOBLINS]) {
      expect(JOBS[id].pay, id).toEqual([]);
      expect(JOBS[id].grants, id).toBeUndefined();
      expect(JOBS[id].deliversTo, id).toBeUndefined();
    }
  });

  it("bring home no more stone at their largest roll than a level-1 warehouse holds", () => {
    expect(haul("stone-outcrop", 2, 3).max).toBeLessThanOrEqual(warehouseCapacity(1));
  });
});

/**
 * Every party this file plays, each test taking its party from here
 * (typescript.md, rule 26). A villager reaches Highcrag only by caravan, and
 * is played as the party with mining 1.
 */
const PARTIES = {
  miner: party("miner"),
  villager: party("villager"),
  fighter: party("fighter"),
  knight: party("knight"),
  minerAndFighter: party("miner", "fighter"),
  minerAndKnight: party("miner", "knight"),
  knightAndTwoMiners: party("knight", "miner", "miner"),
  fighterAndTwoMiners: party("fighter", "miner", "miner"),
};
const EVERY_PARTY: readonly (readonly SnapshotHero[])[] = Object.values(PARTIES);
const named = (heroes: readonly SnapshotHero[]) => heroes.map((h) => h.unitType).join(", ");
const mines = (heroes: readonly SnapshotHero[]) => heroes.some((h) => h.unitType === "miner");

describe("Stone from the quarry face", () => {
  const job = JOBS[QUARRY_FACE];

  it("is two outcrops or three, and a wolf on half the runs, in one gather", () => {
    expect(job.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    const gather = job.stages[1];
    expect(gather?.kind === "gather" && gather.opponents).toEqual([{ type: "stone-outcrop", count: { min: 2, max: 3 } }, { type: "wolf", count: 1, chancePercent: 50 }]);
  });

  for (const heroes of EVERY_PARTY) {
    const words = mines(heroes) ? `${haul("stone-outcrop", 2, 2).min} to ${haul("stone-outcrop", 2, 3).max} stone` : "no stone";
    it(`is completed by ${named(heroes)} on every one of ${SEEDS} seeds, with ${words} and no death`, () => {
      for (const { seed, result } of played(QUARRY_FACE, heroes)) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        const amount = rewardOf(result, "stone");
        if (mines(heroes)) {
          expect(amount, seed).toBeGreaterThanOrEqual(haul("stone-outcrop", 2, 2).min);
          expect(amount, seed).toBeLessThanOrEqual(haul("stone-outcrop", 2, 3).max);
        } else expect(amount, seed).toBe(0);
      }
    });
  }
});

describe("Goblins in the quarry", () => {
  const job = JOBS[QUARRY_GOBLINS];

  it("is three outcrops with a goblin rock thrower behind them, in one gather", () => {
    expect(job.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    const gather = job.stages[1];
    expect(gather?.kind === "gather" && gather.opponents).toEqual([{ type: "stone-outcrop", count: 3 }, { type: "goblin-rock-thrower", count: 1 }]);
  });

  for (const heroes of [PARTIES.miner, PARTIES.villager, PARTIES.fighter, PARTIES.knight]) {
    it(`defeats a lone ${named(heroes)} on every one of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(QUARRY_GOBLINS, heroes)) expect(result.outcome, seed).toBe("defeat");
    });
  }

  for (const heroes of [PARTIES.minerAndKnight, PARTIES.knightAndTwoMiners, PARTIES.fighterAndTwoMiners]) {
    it(`is completed by ${named(heroes)} on every one of ${SEEDS} seeds, with ${haul("stone-outcrop", 2, 3).min} to ${haul("stone-outcrop", 2, 3).max} stone and no death`, () => {
      for (const { seed, result } of played(QUARRY_GOBLINS, heroes)) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(rewardOf(result, "stone"), seed).toBeGreaterThanOrEqual(haul("stone-outcrop", 2, 3).min);
        expect(rewardOf(result, "stone"), seed).toBeLessThanOrEqual(haul("stone-outcrop", 2, 3).max);
      }
    });
  }

  it(`is completed by a miner and a fighter on every one of ${SEEDS} seeds, losing a hero on some: a knight is what makes it safe`, () => {
    const runs = played(QUARRY_GOBLINS, PARTIES.minerAndFighter);
    for (const { seed, result } of runs) expect(result.outcome, seed).toBe("complete");
    expect(runs.some((r) => r.result.dead.length > 0)).toBe(true);
  });
});

describe("both of the quarry's jobs", () => {
  it(`never run a gather out, for any party of this file, on ${SEEDS} seeds`, () => {
    for (const id of [QUARRY_FACE, QUARRY_GOBLINS]) {
      for (const heroes of EVERY_PARTY) {
        for (const { seed, result } of played(id, heroes)) {
          for (const stage of result.stages) expect(stage.ended, `${id} ${named(heroes)} ${seed}`).not.toBe("timeout");
        }
      }
    }
  });
});
