/**
 * Abilities: what a unit does on its turn, with tags, reach by line and a
 * warmup.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/domain/ability.ts and
 * tags.ts. Kept: the definition with its tags, targeting by line ("column
 * reach" there), the selection rule and the warmup. Left behind (decision
 * 0030): costs and resource pools, per-ability cooldowns, status effects,
 * custom resolvers, area shapes and presentation cues. The effects are HEAT's
 * own: damage, gather, guard and move up.
 */

import type { Material } from "../index.js";
import type { Line } from "./unit.js";

export type AbilityTag = "melee-attack" | "ranged-attack" | "physical" | "slashing" | "piercing" | "gather" | "support" | "movement";

/** From the actor's line, the lines of the target side the ability reaches. */
export interface LineReach {
  readonly actorLine: Line;
  readonly targetLines: readonly Line[];
}

/**
 * How the target is chosen among the units in reach. Ties are broken by the
 * seeded random number generator, because a line has no order within it.
 *
 * - `closest`: the nearest line.
 * - `weakest`: the lowest health.
 * - `below-half`: an ally below half its health, the lowest share first.
 */
export type TargetSelection = "closest" | "weakest" | "below-half";

export type Targeting =
  | { readonly side: "self" }
  | {
      readonly side: "enemy" | "ally";
      readonly reach: readonly LineReach[];
      readonly selection: TargetSelection;
    };

/**
 * What an ability does when it resolves.
 *
 * - `damage`: the actor's damage to a unit or a resource node.
 * - `gather`: the actor's damage to a resource node of this material, and to
 *   nothing else: a strike with its own look.
 *
 * Either way a node's yield is by the actor's gather rating for its material
 * (decision 0051), and a node the actor has no rating for is hit only when
 * nothing else is usable (resolution.ts).
 * - `guard`: until it expires, hits aimed at the ally land on the actor.
 * - `move-up`: the actor steps up one line.
 */
export type AbilityEffect =
  | { readonly kind: "damage" }
  | { readonly kind: "gather"; readonly material: Material }
  | { readonly kind: "guard"; readonly durationMs: number }
  | { readonly kind: "move-up" };

export interface AbilityDefinition {
  readonly abilityId: string;
  readonly name: string;
  readonly tags: readonly AbilityTag[];
  readonly targeting: Targeting;
  /** Time between declaring and resolving, in whole milliseconds. */
  readonly warmupMs: number;
  readonly effect: AbilityEffect;
}
