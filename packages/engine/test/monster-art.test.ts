import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MONSTER_SPRITE_SETS, MONSTER_TYPES, PROP_SPRITE_SETS, RESOURCE_TYPES } from "../src/index.js";
import { must } from "./must.js";

const art = new URL("../../../art/", import.meta.url);

/** Each set under art/<kind>/, grouped by what its provenance says it draws. */
function setsByProvenance(kind: "monsters" | "props"): Record<string, string[]> {
  const dir = new URL(`${kind}/`, art);
  const sets: Record<string, string[]> = {};
  for (const set of readdirSync(dir).sort()) {
    const provenance = JSON.parse(readFileSync(new URL(`${set}/provenance.json`, dir), "utf8")) as Record<string, string[]>;
    for (const type of must(provenance[kind], `${set}'s ${kind}`)) (sets[type] ??= []).push(set);
  }
  return sets;
}

const sorted = (map: Readonly<Record<string, readonly string[] | undefined>>) =>
  Object.fromEntries(Object.entries(map).map(([type, sets]) => [type, [...(sets ?? [])].sort()]));

describe("monster and prop art", () => {
  it("lists the sprite sets of each monster exactly as the sets' provenance says", () => {
    expect(sorted(MONSTER_SPRITE_SETS)).toEqual(setsByProvenance("monsters"));
  });

  it("lists the sprite sets of each prop exactly as the sets' provenance says", () => {
    expect(sorted(PROP_SPRITE_SETS)).toEqual(setsByProvenance("props"));
  });

  it("draws every monster and only the battle's resources", () => {
    expect(Object.keys(MONSTER_SPRITE_SETS).sort()).toEqual([...MONSTER_TYPES].sort());
    for (const resource of Object.keys(PROP_SPRITE_SETS)) expect(RESOURCE_TYPES).toContain(resource);
  });
});
