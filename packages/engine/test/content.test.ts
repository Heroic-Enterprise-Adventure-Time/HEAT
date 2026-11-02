import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HALL_CAPACITY,
  HERO_NAMES,
  LOCATIONS,
  PRESENTATIONS,
  SPRITE_SETS,
  SPRITE_SET_PRESENTATION,
  STARTING_LOCATION,
  UNIT_TYPES,
  hallCapacity,
  heroNames,
  location,
  recruitCost,
  warehouseCapacity,
  FACILITIES,
  WAREHOUSE_CAPACITY,
  buildRefusal,
  facilityArtLevel,
  nextLevel,
  must,
  type FacilityKind,
} from "../src/index.js";

const heroes = new URL("../../../art/heroes/", import.meta.url);
const facilities = new URL("../../../art/facilities/", import.meta.url);

describe("static content", () => {
  const provenances = readdirSync(heroes)
    .sort()
    .map((set) => ({ set, ...(JSON.parse(readFileSync(new URL(`${set}/provenance.json`, heroes), "utf8")) as { classes: string[]; presentation: string }) }));

  it("lists the sprite sets each unit type allows exactly as the sets' provenance says", () => {
    const fromArt: Record<string, string[]> = {};
    for (const { set, classes } of provenances) for (const unitType of classes) (fromArt[unitType] ??= []).push(set);
    const fromContent = Object.fromEntries(Object.entries(SPRITE_SETS).map(([u, sets]) => [u, [...sets].sort()]));
    expect(fromContent).toEqual(fromArt);
    expect(Object.keys(SPRITE_SETS).sort()).toEqual([...UNIT_TYPES].sort());
  });

  it("labels every sprite set masculine, feminine or either, exactly as its provenance says", () => {
    expect(SPRITE_SET_PRESENTATION).toEqual(Object.fromEntries(provenances.map(({ set, presentation }) => [set, presentation])));
    for (const p of Object.values(SPRITE_SET_PRESENTATION)) expect(PRESENTATIONS).toContain(p);
  });

  it("offers the villager at hall level 1 at every location, which the free villager needs", () => {
    for (const l of LOCATIONS) {
      expect(l.recruits.find((r) => r.unitType === "villager")?.hallLevel).toBe(1);
      expect(l.ownFacilities).toContain("heroes-hall");
      expect(l.ownFacilities).toContain("warehouse");
    }
  });

  it("starts a new player at Millbrook, which recruits the villager and the fighter", () => {
    expect(location(STARTING_LOCATION)?.name).toBe("Millbrook");
    expect(location(STARTING_LOCATION)?.recruits.map((r) => r.unitType)).toEqual(["villager", "fighter"]);
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
    const villager = must(recruits[0], "the villager recruit");
    const fighter = must(recruits[1], "the fighter recruit");
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
    expect(nextLevel("mine", 1)).toBeUndefined();
    for (const kind of Object.keys(FACILITIES) as FacilityKind[]) {
      for (const { amount } of FACILITIES[kind].levels[0]?.cost ?? []) expect(amount).toBeLessThanOrEqual(warehouseCapacity(1));
    }
  });

  it("refuses a build at the highest level, then for a missing facility, then for the cost", () => {
    const poor = { levels: { "heroes-hall": 1, warehouse: 1 }, holdings: [{ material: "timber", balance: 60 }] };
    expect(buildRefusal({ ...poor, levels: { mine: 1 } }, "mine")?.code).toBe("MAX_LEVEL");
    expect(buildRefusal(poor, "caravan-hub")).toMatchObject({ code: "REQUIRES", missing: [{ kind: "warehouse", level: 2 }] });
    expect(buildRefusal(poor, "mine")).toMatchObject({ code: "INSUFFICIENT_RESOURCES", short: [{ material: "cloth", amount: 3, balance: 0 }] });
    expect(buildRefusal({ ...poor, holdings: [{ material: "timber", balance: 60 }, { material: "cloth", balance: 3 }] }, "mine")).toBeNull();
  });

  it("has enough distinct names for every presentation that a full hall never runs out", () => {
    const all = PRESENTATIONS.flatMap((p) => HERO_NAMES[p]);
    expect(new Set(all).size).toBe(all.length);
    const largestHall = Math.max(...HALL_CAPACITY);
    for (const p of PRESENTATIONS) expect(heroNames(p).length).toBeGreaterThan(largestHall);
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
