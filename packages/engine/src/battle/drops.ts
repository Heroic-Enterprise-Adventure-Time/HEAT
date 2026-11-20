/**
 * An enemy's drops, rolled when it goes down (decision 0058).
 *
 * New in HEAT. The roll is the enemy's own: a generator seeded by the battle's
 * seed, which is the adventure's seed and the stage, and the enemy's id. It
 * shares nothing with the battle's generator, so no draw of the fight moves
 * it, and nothing a player does reaches it. Each drop takes two draws, its
 * chance and its amount, whatever the party's level in the drop's trait and
 * whether or not anyone carries it, so that an enemy on a seed rolls the same
 * at every level: what an override can change is which heroes are standing
 * when the enemy falls, which picks the row the roll is read against, and
 * never the roll.
 */

import type { Reward } from "../index.js";
import { SeededRng } from "./rng.js";
import { type Drop, dropRow, type GatheringTrait } from "./unit.js";

/**
 * What an enemy drops for a party whose highest level in each trait, among
 * its heroes standing, is `levelOf`: one entry for each drop that fell, in
 * the order the enemy lists them. A trait nobody standing carries is level 0
 * and drops nothing.
 */
export function rollDrops(seed: string, unitId: string, drops: readonly Drop[], levelOf: (trait: GatheringTrait) => number): Reward[] {
  const rng = new SeededRng(`${seed}#drops#${unitId}`);
  return drops.flatMap((drop) => {
    const chance = rng.nextInt(1, 100);
    const share = rng.next();
    const row = dropRow(drop, levelOf(drop.trait));
    if (!row || chance > row.chancePercent) return [];
    const amount = row.min + Math.floor(share * (row.max - row.min + 1));
    return amount > 0 ? [{ material: drop.material, amount }] : [];
  });
}
