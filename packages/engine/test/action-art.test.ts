import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ABILITIES, ABILITY_EFFECTS, MONSTER_TYPES, UNIT_TYPES, WEAPON_SPRITES } from "../src/index.js";
import { must } from "./must.js";

const art = new URL("../../../art/", import.meta.url);

/** What each set under art/<kind>/ serves, by its provenance: the set for each wielder or ability. */
function setByProvenance(kind: "weapons" | "effects", field: "wielders" | "abilities"): Record<string, string> {
  const dir = new URL(`${kind}/`, art);
  const sets: Record<string, string> = {};
  for (const set of readdirSync(dir).sort()) {
    const provenance = JSON.parse(readFileSync(new URL(`${set}/provenance.json`, dir), "utf8")) as Record<string, string[]>;
    for (const key of must(provenance[field], `${set}'s ${field}`)) {
      expect(sets[key], `${key} is served by two sets`).toBeUndefined();
      sets[key] = set;
    }
  }
  return sets;
}

describe("action art", () => {
  it("gives each wielder the weapon whose provenance names it", () => {
    expect(WEAPON_SPRITES).toEqual(setByProvenance("weapons", "wielders"));
  });

  it("gives each ability the effect whose provenance names it", () => {
    expect(ABILITY_EFFECTS).toEqual(setByProvenance("effects", "abilities"));
  });

  it("names only unit types, monsters and abilities that exist", () => {
    for (const wielder of Object.keys(WEAPON_SPRITES)) expect([...UNIT_TYPES, ...MONSTER_TYPES]).toContain(wielder);
    for (const ability of Object.keys(ABILITY_EFFECTS)) expect(Object.keys(ABILITIES)).toContain(ability);
  });
});
