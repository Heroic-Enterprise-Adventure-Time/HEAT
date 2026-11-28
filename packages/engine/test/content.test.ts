import { readdirSync } from "node:fs";

import { mapValues } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  buildRefusal,
  FACILITIES,
  facilityArtLevel,
  type FacilityKind,
  HALL_CAPACITY,
  hallCapacity,
  HERO_NAMES,
  heroNames,
  isUnlockId,
  jobOf,
  JOBS,
  location,
  LOCATIONS,
  must,
  nextLevel,
  PRESENTATIONS,
  recruitCost,
  recruitRefusal,
  SPRITE_SET_PRESENTATION,
  SPRITE_SETS,
  STARTING_LOCATION,
  UNIT_TYPES,
  UNLOCK_IDS,
  unlockedLocations,
  UNLOCKS,
  WAREHOUSE_CAPACITY,
  warehouseCapacity,
} from "../src/index.js";
import { HIGHCRAG } from "./adventure/helpers.js";
import { artDir, artSets, listed } from "./art.js";

const facilities = artDir("facilities");

describe("static content", () => {
  const provenances = artSets("heroes").map((set) => ({ set: set.set, classes: listed(set, "classes"), presentation: set.provenance["presentation"] }));

  it("lists the sprite sets each unit type allows exactly as the sets' provenance says", () => {
    const fromArt: Record<string, string[]> = {};
    for (const { set, classes } of provenances) for (const unitType of classes) (fromArt[unitType] ??= []).push(set);
    const fromContent = mapValues(SPRITE_SETS, (sets) => [...sets].sort());
    expect(fromContent).toEqual(fromArt);
    expect(Object.keys(SPRITE_SETS).sort()).toEqual([...UNIT_TYPES].sort());
  });

  it("labels every sprite set masculine, feminine or either, exactly as its provenance says", () => {
    expect(SPRITE_SET_PRESENTATION).toEqual(Object.fromEntries(provenances.map(({ set, presentation }) => [set, presentation])));
    for (const p of Object.values(SPRITE_SET_PRESENTATION)) expect(PRESENTATIONS).toContain(p);
  });

  it("offers the villager at hall level 1 at the starting location, which the free villager needs, and gives every location's camp a hall and a warehouse", () => {
    expect(location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "villager")?.hallLevel).toBe(1);
    for (const l of LOCATIONS) {
      expect(l.ownFacilities).toContain("heroes-hall");
      expect(l.ownFacilities).toContain("warehouse");
    }
  });

  it("names every unlock once, each with a name and the words said when it is earned", () => {
    expect(Object.keys(UNLOCKS)).toEqual([...UNLOCK_IDS]);
    expect(new Set(UNLOCK_IDS).size).toBe(UNLOCK_IDS.length);
    for (const id of UNLOCK_IDS) {
      expect(UNLOCKS[id].name.length, id).toBeGreaterThan(0);
      expect(UNLOCKS[id].earned.length, id).toBeGreaterThan(0);
      expect(isUnlockId(id)).toBe(true);
    }
    expect(isUnlockId("an-unlock-of-another-version")).toBe(false);
  });

  it("needs no unlock for the starting location, and for any other a known unlock that no second location needs", () => {
    expect(location(STARTING_LOCATION)?.unlock).toBeUndefined();
    const needed = LOCATIONS.filter((l) => l.id !== STARTING_LOCATION).map((l) => l.unlock);
    for (const unlock of needed) expect(UNLOCK_IDS).toContain(unlock);
    expect(new Set(needed).size).toBe(needed.length);
    expect(new Set(LOCATIONS.map((l) => l.id)).size).toBe(LOCATIONS.length);
  });

  it("gives a player a camp at the starting location alone until an unlock is held, and then at its location too", () => {
    expect(unlockedLocations(new Set()).map((l) => l.id)).toEqual([STARTING_LOCATION]);
    expect(unlockedLocations(new Set(["an-unlock-of-another-version"])).map((l) => l.id)).toEqual([STARTING_LOCATION]);
    expect(unlockedLocations(new Set(UNLOCK_IDS))).toEqual(LOCATIONS);
    for (const l of LOCATIONS) {
      if (l.unlock) expect(unlockedLocations(new Set([l.unlock])).map((u) => u.id)).toEqual([STARTING_LOCATION, l.id]);
    }
  });

  it("has Highcrag behind the road's unlock, with the shared job board, the quarry and a caravan hub to build, and the miner and the fighter at Millbrook's costs", () => {
    const highcrag = must(location(HIGHCRAG), "Highcrag");
    const millbrook = must(location(STARTING_LOCATION), "the starting location");
    expect(highcrag.name).toBe("Highcrag");
    expect(highcrag.unlock).toBe("road-to-highcrag");
    expect(highcrag.sharedFacilities).toEqual(["job-board"]);
    expect(highcrag.buildableFacilities).toEqual(["quarry", "caravan-hub"]);
    expect(highcrag.recruits.map((r) => r.unitType)).toEqual(["miner", "fighter", "knight"]);
    for (const recruit of highcrag.recruits.filter((r) => r.unitType !== "knight")) {
      expect(recruit).toEqual(millbrook.recruits.find((r) => r.unitType === recruit.unitType));
    }
  });

  it("recruits the knight at Highcrag alone, at hall level 1, for ore and hide: the first thing that costs hide", () => {
    for (const l of LOCATIONS.filter((l) => l.id !== HIGHCRAG)) expect(l.recruits.map((r) => r.unitType), l.id).not.toContain("knight");
    const knight = must(location(HIGHCRAG)?.recruits.find((r) => r.unitType === "knight"), "Highcrag's knight");
    expect(knight.hallLevel).toBe(1);
    expect(knight.cost).toEqual([{ material: "ore", amount: 50 }, { material: "hide", amount: 4 }]);
    const costsHide = (cost: readonly { material: string }[]) => cost.some((c) => c.material === "hide");
    const others = [
      ...LOCATIONS.flatMap((l) => l.recruits.filter((r) => r !== knight).map((r) => r.cost)),
      ...Object.values(FACILITIES).flatMap((f) => f.levels.map((level) => level.cost)),
    ];
    expect(others.filter(costsHide)).toEqual([]);
  });

  it("lets a camp build the quarry for 60 timber and 40 ore, one level, with nothing first, at Highcrag alone", () => {
    expect(FACILITIES.quarry.levels).toEqual([{ cost: [{ material: "timber", amount: 60 }, { material: "ore", amount: 40 }], requires: [] }]);
    expect(LOCATIONS.filter((l) => l.buildableFacilities.includes("quarry")).map((l) => l.id)).toEqual([HIGHCRAG]);
  });

  it("has no free hero at Highcrag: every recruit there costs its cost with no hero alive", () => {
    for (const recruit of must(location(HIGHCRAG), "Highcrag").recruits) {
      expect(recruit.cost.length, recruit.unitType).toBeGreaterThan(0);
      expect(recruitCost(recruit, 0), recruit.unitType).toEqual(recruit.cost);
    }
  });

  it("starts a new player at Millbrook, which recruits the villager, the lumberjack, the miner, the fighter and the ranger", () => {
    expect(location(STARTING_LOCATION)?.name).toBe("Millbrook");
    expect(location(STARTING_LOCATION)?.recruits.map((r) => r.unitType)).toEqual(["villager", "lumberjack", "miner", "fighter", "ranger"]);
    expect(location(STARTING_LOCATION)?.sharedFacilities).toEqual(["job-board"]);
  });

  it("lets a Millbrook camp build a mine, a lumber camp and a caravan hub, none of them already standing", () => {
    expect(location(STARTING_LOCATION)?.buildableFacilities).toEqual(["mine", "lumber-camp", "caravan-hub"]);
    for (const l of LOCATIONS) {
      for (const kind of l.buildableFacilities) {
        expect(l.ownFacilities).not.toContain(kind);
        expect(l.sharedFacilities).not.toContain(kind);
      }
    }
  });

  it("prices Millbrook's recruits by the first progression, with the villager free when no hero is alive", () => {
    const recruits = must(location(STARTING_LOCATION), "the starting location").recruits;
    const villager = must(recruits.find((r) => r.unitType === "villager"), "the villager recruit");
    const fighter = must(recruits.find((r) => r.unitType === "fighter"), "the fighter recruit");
    expect(recruitCost(villager, 0)).toEqual([]);
    expect(recruitCost(villager, 1)).toEqual([{ material: "timber", amount: 20 }]);
    expect(recruitCost(fighter, 0)).toEqual([{ material: "ore", amount: 40 }]);
    expect(recruitCost(fighter, 2)).toEqual([{ material: "ore", amount: 40 }]);
  });

  it("caps a camp's heroes and stock by its hall's and warehouse's levels", () => {
    expect([1, 2, 3].map(hallCapacity)).toEqual([4, 6, 8]);
    expect([1, 2, 3].map(warehouseCapacity)).toEqual([100, 200, 400]);
    // Every level the content offers has a cap.
    expect(HALL_CAPACITY).toHaveLength(FACILITIES["heroes-hall"].levels.length);
    expect(WAREHOUSE_CAPACITY).toHaveLength(FACILITIES.warehouse.levels.length);
  });

  it("gives each facility's levels the pictures under art/facilities, falling back to the highest below", () => {
    for (const kind of Object.keys(FACILITIES) as FacilityKind[]) {
      const files = readdirSync(new URL(`${kind}/`, facilities)).filter((f) => /^level-\d+\.png$/.test(f));
      expect(files.map((f) => Number(f.slice(6, -4))).sort()).toEqual([...FACILITIES[kind].art]);
    }
    expect(facilityArtLevel("mine", 0)).toBe(0);
    expect(facilityArtLevel("mine", 1)).toBe(1);
    expect(facilityArtLevel("job-board", 1)).toBe(1);
    expect(facilityArtLevel("job-board", 4)).toBe(1);
  });

  it("prices the mine's first level by the first progression, and keeps every level-1 cost within a level-1 warehouse", () => {
    expect(nextLevel("mine", 0)).toEqual({ level: 1, cost: [{ material: "timber", amount: 60 }, { material: "cloth", amount: 3 }], requires: [] });
    for (const kind of Object.keys(FACILITIES) as FacilityKind[]) {
      for (const { amount } of FACILITIES[kind].levels[0]?.cost ?? []) expect(amount).toBeLessThanOrEqual(warehouseCapacity(1));
    }
  });

  it("refuses a build at the highest level, then for a missing facility, then for the cost", () => {
    const poor = { levels: { "heroes-hall": 1, warehouse: 1 }, holdings: [{ material: "timber", balance: 60 }] };
    expect(buildRefusal({ ...poor, levels: { mine: 2 } }, "mine")?.code).toBe("MAX_LEVEL");
    expect(buildRefusal(poor, "caravan-hub")).toMatchObject({ code: "REQUIRES", missing: [{ kind: "warehouse", level: 2 }] });
    expect(buildRefusal(poor, "mine")).toMatchObject({ code: "INSUFFICIENT_RESOURCES", short: [{ material: "cloth", amount: 3, balance: 0 }] });
    expect(buildRefusal({ ...poor, holdings: [{ material: "timber", balance: 60 }, { material: "cloth", balance: 3 }] }, "mine")).toBeNull();
  });

  it("refuses a recruit for the hall's level, then for a full hall, then for the price, and never the free villager for its price", () => {
    const villager = must(location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "villager"), "the starting location's villager");
    const camp = { hallLevel: villager.hallLevel, activeHeroes: 1, livingHeroes: 1, holdings: [] };
    const price = villager.cost.map(({ material, amount }) => ({ material, amount, balance: 0 }));
    expect(recruitRefusal({ ...camp, hallLevel: villager.hallLevel - 1 }, villager)).toMatchObject({ code: "HALL_LEVEL", hallLevel: villager.hallLevel });
    expect(recruitRefusal({ ...camp, activeHeroes: hallCapacity(camp.hallLevel) }, villager)?.code).toBe("HALL_FULL");
    expect(recruitRefusal(camp, villager)).toMatchObject({ code: "INSUFFICIENT_RESOURCES", short: price });
    expect(recruitRefusal({ ...camp, holdings: price.map((p) => ({ material: p.material, balance: p.amount })) }, villager)).toBeNull();
    // With a free slot and nobody alive, the villager costs nothing; a full hall is full before anything is free.
    expect(recruitRefusal({ ...camp, livingHeroes: 0 }, villager)).toBeNull();
    expect(recruitRefusal({ ...camp, activeHeroes: hallCapacity(camp.hallLevel), livingHeroes: 0 }, villager)?.code).toBe("HALL_FULL");
  });

  it("has enough distinct names for every presentation that a full hall never runs out", () => {
    const all = PRESENTATIONS.flatMap((p) => HERO_NAMES[p]);
    expect(new Set(all).size).toBe(all.length);
    const largestHall = Math.max(...HALL_CAPACITY);
    for (const p of PRESENTATIONS) expect(heroNames(p).length).toBeGreaterThan(largestHall);
  });
});

describe("jobOf", () => {
  it("answers every job of the content by its id", () => {
    for (const [id, job] of Object.entries(JOBS)) expect(jobOf(id)).toBe(job);
  });

  it("answers nothing for an id the content does not know, an inherited property's name included", () => {
    expect(jobOf("a-job-of-another-version")).toBeUndefined();
    expect(jobOf("toString")).toBeUndefined();
    expect(jobOf("__proto__")).toBeUndefined();
  });
});

describe("heroNames", () => {
  it("gives a masculine set the masculine and either names, never a feminine one", () => {
    const names = heroNames("masculine");
    expect(names).toEqual([...HERO_NAMES.masculine, ...HERO_NAMES.either]);
    for (const n of HERO_NAMES.feminine) expect(names).not.toContain(n);
  });

  it("gives a feminine set the feminine and either names, never a masculine one", () => {
    const names = heroNames("feminine");
    expect(names).toEqual([...HERO_NAMES.feminine, ...HERO_NAMES.either]);
    for (const n of HERO_NAMES.masculine) expect(names).not.toContain(n);
  });

  it("gives an either set every name", () => {
    expect([...heroNames("either")].sort()).toEqual(PRESENTATIONS.flatMap((p) => HERO_NAMES[p]).sort());
  });

  it("leaves out the names on the living roster", () => {
    const taken = new Set(["Hugh", "Rowan", "Maud"]);
    const names = heroNames("masculine", taken);
    expect(names).not.toContain("Hugh");
    expect(names).not.toContain("Rowan");
    expect(names).toHaveLength(HERO_NAMES.masculine.length + HERO_NAMES.either.length - 2);
  });

  it("falls back to every allowed name when the roster has taken them all", () => {
    const allowed = heroNames("feminine");
    expect(heroNames("feminine", new Set(allowed))).toEqual(allowed);
  });
});
