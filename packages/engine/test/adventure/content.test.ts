import { mapValues, sum } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  alwaysAppears,
  BATTLE_CONTENT,
  countRange,
  isResourceType,
  JOBS,
  largestStages,
  LEVEL_XP,
  levelForXp,
  location,
  MATERIALS,
  MONSTERS,
  replay,
  RESOURCE_NODES,
  RETREAT,
  WAREHOUSE_CAPACITY,
} from "../../src/index.js";
import { atLargest, contentWithJob, enemiesXp, SEEDS, seeds, snapshot, villagers } from "./helpers.js";

describe("The adventure's content", () => {
  it("gives every job a known location, stages that end with arrive, known opponents, counts and chances that can be rolled, and positive limits", () => {
    for (const [id, job] of Object.entries(JOBS)) {
      expect(job.id).toBe(id);
      expect(location(job.location)).toBeDefined();
      expect(job.stages.at(-1)?.kind).toBe("arrive");
      expect(job.stages.filter((s) => s.kind === "arrive")).toHaveLength(1);
      for (const stage of job.stages) {
        if (stage.kind === "travel") expect(stage.lengthMs).toBeGreaterThan(0);
        if (stage.kind === "fight" || stage.kind === "gather") {
          expect(stage.timeLimitMs).toBeGreaterThan(0);
          expect(stage.opponents.length).toBeGreaterThan(0);
          for (const o of stage.opponents) {
            expect(Object.hasOwn(BATTLE_CONTENT.monsters, o.type) || Object.hasOwn(BATTLE_CONTENT.resources, o.type)).toBe(true);
            // A count is a whole number from 1, or a range of them that is a range.
            const { min, max } = countRange(o.count);
            expect(Number.isInteger(min) && Number.isInteger(max) && min >= 1, `${id} ${o.type}`).toBe(true);
            if (typeof o.count === "number") expect(max).toBe(min);
            else expect(max, `${id} ${o.type}`).toBeGreaterThan(min);
            // A chance is a whole percent short of certain: an entry that always appears states none.
            if (o.chancePercent !== undefined) {
              expect(Number.isInteger(o.chancePercent) && o.chancePercent >= 1 && o.chancePercent <= 99, `${id} ${o.type}`).toBe(true);
            }
          }
          // Something always appears, so no adventure of the job meets an empty stage (decision 0058).
          expect(stage.opponents.some(alwaysAppears), id).toBe(true);
          // A gather is a stage that always has a node to work; a fight need have none.
          if (stage.kind === "gather") expect(stage.opponents.some((o) => alwaysAppears(o) && Object.hasOwn(BATTLE_CONTENT.resources, o.type)), id).toBe(true);
        }
      }
      for (const r of job.pay) expect(MATERIALS).toContain(r.material);
      expect(Number.isInteger(job.bonusXp) && job.bonusXp >= 0, id).toBe(true);
      expect(job.description.length, id).toBeGreaterThan(0);
    }
  });

  it("has Millbrook's three jobs as the design describes them", () => {
    expect(JOBS["pick-up-sticks"].stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(JOBS["pick-up-sticks"].pay).toEqual([]);
    expect(JOBS["wolves-on-the-mill-road"].stages.map((s) => s.kind)).toEqual(["travel", "fight", "arrive"]);
    expect(JOBS["wolves-on-the-mill-road"].pay).toEqual([{ material: "cloth", amount: 10 }]);
    expect(JOBS["timber-from-the-near-woods"].stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(JOBS["timber-from-the-near-woods"].pay).toEqual([{ material: "cloth", amount: 3 }]);
  });

  it("gives each job the XP it gave before the enemies had any: its enemies' and its bonus together (decision 0058)", () => {
    expect(mapValues(JOBS, (job) => job.bonusXp)).toEqual({
      "pick-up-sticks": 2,
      "timber-from-the-near-woods": 4,
      "wolves-on-the-mill-road": 10,
      "ore-from-the-hill": 4,
      "goblins-in-the-old-workings": 6,
    });
    expect(mapValues(JOBS, (job) => enemiesXp(job) + job.bonusXp)).toEqual({
      "pick-up-sticks": 5,
      "timber-from-the-near-woods": 15,
      "wolves-on-the-mill-road": 20,
      "ore-from-the-hill": 15,
      "goblins-in-the-old-workings": 25,
    });
  });

  it("gives 5 more XP when the first job's wolf appears: an enemy that appears by chance adds its own (decision 0058)", () => {
    const sticks = JOBS["pick-up-sticks"];
    expect(enemiesXp(atLargest(sticks)) + sticks.bonusXp).toBe(10);
    // No other job varies yet, so its largest roll is the job.
    for (const [id, job] of Object.entries(JOBS)) {
      if (id !== "pick-up-sticks") expect(largestStages(job), id).toEqual(job.stages);
    }
  });

  for (const job of Object.values(JOBS)) {
    it(`fits the time limits of "${job.name}" to its largest roll: one villager or four never run a stage out, on ${SEEDS} seeds`, () => {
      const largest = atLargest(job);
      const content = contentWithJob(largest);
      for (const count of [1, 4]) {
        for (const seed of seeds) {
          const { result } = replay(snapshot(largest.id, villagers(count)), seed, [], content);
          expect(result.stages.map((s) => s.ended), `${count} ${seed}`).not.toContain("timeout");
        }
      }
    });
  }

  it("brings home from a job's largest roll no more of any resource than a level-1 warehouse holds, at the best row of every drop", () => {
    const cap = WAREHOUSE_CAPACITY[0] ?? 0;
    for (const job of Object.values(JOBS)) {
      const most = Object.fromEntries(MATERIALS.map((material) => [material, job.pay.find((r) => r.material === material)?.amount ?? 0]));
      for (const stage of largestStages(job)) {
        if (stage.kind !== "fight" && stage.kind !== "gather") continue;
        for (const { type, count } of stage.opponents) {
          for (const drop of (isResourceType(type) ? RESOURCE_NODES[type] : MONSTERS[type]).drops) {
            most[drop.material] = (most[drop.material] ?? 0) + count * Math.max(...drop.levels.map((row) => row.max));
          }
        }
      }
      for (const material of MATERIALS) expect(most[material], `${job.id} ${material}`).toBeLessThanOrEqual(cap);
      expect(sum(Object.values(most)), job.id).toBeGreaterThan(0);
    }
  });

  it("says in the first job's description that timber is collected and that a hero who can cut wood is needed (decision 0058)", () => {
    expect(JOBS["pick-up-sticks"].description).toMatch(/cut wood/);
    expect(JOBS["pick-up-sticks"].description).toMatch(/timber/);
  });

  it("makes a retreat certain after a bounded number of attempts", () => {
    expect(RETREAT.intervalMs).toBeGreaterThan(0);
    expect(RETREAT.risePercent).toBeGreaterThan(0);
  });

  it("reads levels from the XP threshold table", () => {
    expect(LEVEL_XP[0]).toBe(0);
    for (let i = 1; i < LEVEL_XP.length; i++) expect(LEVEL_XP[i]).toBeGreaterThan(LEVEL_XP[i - 1] ?? 0);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(9)).toBe(1);
    expect(levelForXp(10)).toBe(2);
    expect(levelForXp(29)).toBe(2);
    expect(levelForXp(30)).toBe(3);
    expect(levelForXp(10_000)).toBe(LEVEL_XP.length);
  });
});
