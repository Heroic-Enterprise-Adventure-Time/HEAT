import { mapValues } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { CART_SPRITE_SETS, MONSTER_SPRITE_SETS, MONSTER_TYPES, PROP_SPRITE_SETS, RESOURCE_TYPES } from "../src/index.js";
import { artSets, listed } from "./art.js";

/** Each set under art/<kind>/, grouped by what its provenance says it draws. */
function setsByProvenance(kind: "monsters" | "props"): Record<string, string[]> {
  const sets: Record<string, string[]> = {};
  for (const set of artSets(kind)) for (const type of listed(set, kind)) (sets[type] ??= []).push(set.set);
  return sets;
}

const sorted = (map: Readonly<Record<string, readonly string[] | undefined>>) => mapValues(map, (sets) => [...(sets ?? [])].sort());

describe("monster and prop art", () => {
  it("lists the sprite sets of each monster exactly as the sets' provenance says", () => {
    expect(sorted(MONSTER_SPRITE_SETS)).toEqual(setsByProvenance("monsters"));
  });

  it("lists the sprite sets of each prop, the cart's among them, exactly as the sets' provenance says", () => {
    expect(sorted({ ...PROP_SPRITE_SETS, cart: CART_SPRITE_SETS })).toEqual(setsByProvenance("props"));
  });

  it("draws every monster and only the battle's resources", () => {
    expect(Object.keys(MONSTER_SPRITE_SETS).sort()).toEqual([...MONSTER_TYPES].sort());
    for (const resource of Object.keys(PROP_SPRITE_SETS)) expect(RESOURCE_TYPES).toContain(resource);
  });
});
