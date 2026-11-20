import { mapValues } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { BATTLE_CONTENT, JOBS, LEVEL_XP, levelForXp, location, MATERIALS, RETREAT } from "../../src/index.js";
import { enemiesXp } from "./helpers.js";

describe("The adventure's content", () => {
  it("gives every job a known location, stages that end with arrive, known opponents and positive limits", () => {
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
            expect(o.count).toBeGreaterThan(0);
          }
          // A gather is a stage with a node to work; a fight has none.
          if (stage.kind === "gather") expect(stage.opponents.some((o) => Object.hasOwn(BATTLE_CONTENT.resources, o.type))).toBe(true);
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
