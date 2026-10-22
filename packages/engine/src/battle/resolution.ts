/**
 * Action selection: which ability a unit uses on its turn, and on whom.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/combat/resolution.ts.
 * Kept: reach by line (`getReachableLines`), usability as "has a target in
 * reach", and target choice by the ability's selection rule. Left behind
 * (decision 0030): priority rules with conditions, tag and tactical targets,
 * traits, equipment, skill trees, status-effect modifiers and resource
 * conditions. A unit's list is walked in order and the first usable ability
 * wins.
 *
 * Resource nodes come last. The list is walked twice: first with regular
 * attacks aimed at units only, gather abilities at their own kind of node,
 * and guard and move up as they are; then, only if nothing was usable, with
 * regular attacks aimed at resource nodes.
 */

import type { AbilityDefinition } from "./ability.js";
import type { SeededRng } from "./rng.js";
import type { ActionContext, ActionSelection, UnitState } from "./state.js";
import { lineAhead, lineIndex, type Line } from "./unit.js";

/** The first walk of the list, or the second, which aims regular attacks at resource nodes. */
export type SelectionPass = "units" | "resources";

/**
 * The target lines an ability reaches from the actor's line, or null if it
 * cannot be used from that line.
 */
export function getReachableLines(ability: AbilityDefinition, actorLine: Line): readonly Line[] | null {
  if (ability.targeting.side === "self") return null;
  for (const reach of ability.targeting.reach) {
    if (reach.actorLine === actorLine) return reach.targetLines;
  }
  return null;
}

function belowHalf(unit: UnitState): boolean {
  return unit.health * 2 < unit.stats.maxHealth;
}

function holdsGuard(actor: UnitState, clock: number): boolean {
  return actor.guard !== null && actor.guard.until > clock;
}

/**
 * The units an ability could target in this pass, before the selection rule
 * chooses among them. Pure: it never draws from the random number generator,
 * so testing usability leaves the run unchanged.
 */
export function targetCandidates(
  ability: AbilityDefinition,
  context: ActionContext,
  pass: SelectionPass,
): readonly UnitState[] {
  const { actor, clock } = context;
  const { effect, targeting } = ability;

  if (targeting.side === "self") {
    if (pass !== "units") return [];
    if (effect.kind === "move-up") return lineAhead(actor.line) === undefined ? [] : [actor];
    return [actor];
  }

  const lines = getReachableLines(ability, actor.line);
  if (lines === null) return [];
  const pool = (targeting.side === "enemy" ? context.opponents : context.allies).filter(
    (u) => u.alive && u !== actor && lines.includes(u.line),
  );

  switch (effect.kind) {
    case "damage":
      return pool.filter((u) => (pass === "units" ? u.kind !== "resource" : u.kind === "resource"));
    case "gather":
      return pass === "units" ? pool.filter((u) => u.kind === "resource" && u.material === effect.material) : [];
    case "guard":
      if (pass !== "units" || holdsGuard(actor, clock)) return [];
      return pool.filter((u) => u.kind !== "resource" && belowHalf(u));
    case "move-up":
      return [];
  }
}

/** Whether the ability has a target now, in either pass. */
export function isAbilityUsable(ability: AbilityDefinition, context: ActionContext): boolean {
  return targetCandidates(ability, context, "units").length > 0 || targetCandidates(ability, context, "resources").length > 0;
}

/**
 * Choose among the candidates by the ability's selection rule. Ties draw from
 * the random number generator, and only ties do.
 */
export function pickTarget(ability: AbilityDefinition, candidates: readonly UnitState[], rng: SeededRng): UnitState | undefined {
  const { targeting } = ability;
  if (candidates.length === 0) return undefined;
  if (targeting.side === "self") return candidates[0];

  const { selection } = targeting;
  const score = (u: UnitState): number => {
    switch (selection) {
      case "closest":
        return lineIndex(u.line);
      case "weakest":
        return u.health;
      case "below-half":
        return u.health / u.stats.maxHealth;
    }
  };
  const best = Math.min(...candidates.map(score));
  const tied = candidates.filter((u) => score(u) === best);
  return tied.length === 1 ? tied[0] : rng.pick(tied);
}

/** Select the first usable ability in the list and its target, units first, then resource nodes. */
export function selectAction(
  actions: readonly AbilityDefinition[],
  context: ActionContext,
  rng: SeededRng,
): ActionSelection | undefined {
  for (const pass of ["units", "resources"] as const) {
    for (const ability of actions) {
      const candidates = targetCandidates(ability, context, pass);
      if (candidates.length === 0) continue;
      const target = pickTarget(ability, candidates, rng);
      if (target) return { ability, target };
    }
  }
  return undefined;
}

/** Select a target for one forced ability, units first, then resource nodes; undefined if it is not usable. */
export function selectForced(ability: AbilityDefinition, context: ActionContext, rng: SeededRng): ActionSelection | undefined {
  return selectAction([ability], context, rng);
}
