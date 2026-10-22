import { describe, expect, it } from "vitest";
import { BATTLE_CONTENT, JOBS, LEVEL_XP, MATERIALS, RETREAT, levelForXp, location } from "../../src/index.js";

describe("The adventure's content", () => {
  it("gives every job a known location, stages that end with arrive, known opponents and positive limits", () => {
    for (const [id, job] of Object.entries(JOBS)) {
      expect(job.id).toBe(id);
      expect(location(job.location)).toBeDefined();
      expect(job.stages.at(-1)?.kind).toBe("arrive");
      expect(job.stages.filter((s) => s.kind === "arrive")).toHaveLength(1);
      for (const stage of job.stages) {
        if (stage.kind === "travel") expect(stage.lengthMs).toBeGreaterThan(0);
        if (stage.kind === "fight") {
          expect(stage.timeLimitMs).toBeGreaterThan(0);
          for (const m of stage.monsters) expect(Object.hasOwn(BATTLE_CONTENT.monsters, m.type) && m.count > 0).toBe(true);
        }
        if (stage.kind === "gather") {
          expect(stage.timeLimitMs).toBeGreaterThan(0);
          expect(stage.carry).toBeGreaterThan(0);
          for (const n of stage.nodes) expect(Object.hasOwn(BATTLE_CONTENT.resources, n.type) && n.count > 0).toBe(true);
        }
      }
      for (const r of job.pay) expect(MATERIALS).toContain(r.material);
      expect(job.xp).toBeGreaterThan(0);
      expect(job.retreat.xpPercent).toBeGreaterThanOrEqual(0);
      expect(job.retreat.xpPercent).toBeLessThanOrEqual(100);
    }
  });

  it("has Millbrook's three jobs as the design describes them", () => {
    expect(JOBS["pick-up-sticks"].stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(JOBS["pick-up-sticks"].pay).toEqual([]);
    expect(JOBS["pick-up-sticks"].retreat).toEqual({ keepsPay: false, keepsCargo: true, xpPercent: 50 });
    expect(JOBS["wolves-on-the-mill-road"].stages.map((s) => s.kind)).toEqual(["travel", "fight", "arrive"]);
    expect(JOBS["wolves-on-the-mill-road"].pay).toEqual([{ material: "cloth", amount: 10 }]);
    expect(JOBS["wolves-on-the-mill-road"].retreat).toEqual({ keepsPay: false, keepsCargo: true, xpPercent: 50 });
    expect(JOBS["timber-from-the-near-woods"].stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(JOBS["timber-from-the-near-woods"].pay).toEqual([{ material: "cloth", amount: 3 }]);
    expect(JOBS["timber-from-the-near-woods"].retreat).toEqual({ keepsPay: false, keepsCargo: true, xpPercent: 50 });
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
