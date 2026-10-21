/**
 * The battle: the turn machinery adapted from BattleScript Online
 * (architecture overview, "Engine provenance"; decision 0030).
 */
export * from "./ability.js";
export * from "./engine.js";
export * from "./events.js";
export * from "./override.js";
export * from "./resolution.js";
export { SeededRng } from "./rng.js";
export type { ActionContext, ActionSelection, DeclaredAction, Guard, UnitState } from "./state.js";
export * from "./unit.js";
