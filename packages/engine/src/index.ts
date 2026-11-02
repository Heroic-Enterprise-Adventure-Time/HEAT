/**
 * The engine: the static content, the battle engine adapted from
 * BattleScript Online (architecture overview, "Engine provenance"), and the
 * adventure engine with its replay entry point. One package, imported by the
 * hub, which verifies, and the Angular client, which plays, so both run the
 * same rules. The spike's rewards-for-a-seed function went with Issue-114.
 */

/** The resources; there is no currency (game.md, "Resources"). The list declares the union (typescript.md, rule 18). */
export const MATERIALS = ["timber", "ore", "cloth"] as const;
export type Material = (typeof MATERIALS)[number];

export interface Reward {
  material: Material;
  amount: number;
}

export * from "./content.js";
export * from "./battle/index.js";
export * from "./adventure/index.js";
export * from "./action-art.js";
export * from "./monster-art.js";
export * from "./must.js";
