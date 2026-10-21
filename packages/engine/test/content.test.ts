import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HERO_NAMES,
  LOCATIONS,
  SPRITE_SETS,
  STARTING_LOCATION,
  UNIT_TYPES,
  hallCapacity,
  location,
  warehouseCapacity,
} from "../src/index.js";

const heroes = new URL("../../../art/heroes/", import.meta.url);

describe("static content", () => {
  it("lists the sprite sets each unit type allows exactly as the sets' provenance says", () => {
    const fromArt: Record<string, string[]> = {};
    for (const set of readdirSync(heroes).sort()) {
      const provenance = JSON.parse(readFileSync(new URL(`${set}/provenance.json`, heroes), "utf8")) as { classes: string[] };
      for (const unitType of provenance.classes) (fromArt[unitType] ??= []).push(set);
    }
    const fromContent = Object.fromEntries(Object.entries(SPRITE_SETS).map(([u, sets]) => [u, [...sets].sort()]));
    expect(fromContent).toEqual(fromArt);
    expect(Object.keys(SPRITE_SETS).sort()).toEqual([...UNIT_TYPES].sort());
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

  it("caps a level-1 camp at 4 heroes and 100 of each resource", () => {
    expect(hallCapacity(1)).toBe(4);
    expect(warehouseCapacity(1)).toBe(100);
  });

  it("has enough distinct names that a full hall never runs out", () => {
    expect(new Set(HERO_NAMES).size).toBe(HERO_NAMES.length);
    expect(HERO_NAMES.length).toBeGreaterThan(hallCapacity(1));
  });
});
