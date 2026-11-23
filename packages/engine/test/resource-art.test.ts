import { existsSync, readFileSync } from "node:fs";

import { uniq } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { MATERIALS, MONSTERS, RESOURCE_NODES } from "../src/index.js";

const icons = new URL("../../../art/icons/", import.meta.url);

/** The icons as their provenance lists them: each by what it stands for, with its file. */
const listed = (JSON.parse(readFileSync(new URL("provenance.json", icons), "utf8")) as { icons: Record<string, { file: string }> }).icons;

/** Every resource an enemy of the content drops: what the battle scene shows a drop of (decision 0058, Issue-344). */
const dropped = uniq([...Object.values(MONSTERS), ...Object.values(RESOURCE_NODES)].flatMap((enemy) => enemy.drops.map((drop) => drop.material)));

describe("resource art", () => {
  it("has an icon, named for the resource, for every resource an enemy drops", () => {
    expect(dropped.length).toBeGreaterThan(0);
    for (const material of dropped) {
      expect(listed[material]?.file, `the icon of ${material} in art/icons/provenance.json`).toBe(`${material}.png`);
      expect(existsSync(new URL(`${material}.png`, icons)), `art/icons/${material}.png`).toBe(true);
    }
  });

  it("drops only resources the game has", () => {
    for (const material of dropped) expect(MATERIALS).toContain(material);
  });
});
