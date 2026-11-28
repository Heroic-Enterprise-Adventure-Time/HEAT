import type { TileHero } from './hero-tile';

/**
 * What was gained, in the player's words: what a screen reader is given for
 * a chip and for a hero of a gains block, whole from the start, while the
 * amounts it shows count up (angular.md, rules 9 and 14).
 */

/** An amount of a resource, "3 cloth": one resource of a job's pay, of what a party carries, of what came home. */
export function rewardWords(reward: { readonly amount: number; readonly material: string }): string {
  return `${reward.amount} ${reward.material}`;
}

/** What a hero gained, "Wat, fighter, level 2: +15 XP, level up": who it is at the level it ends with, then its XP and whether that gave a level, or that it died. */
export function heroGainWords(gained: { readonly hero: Pick<TileHero, 'name' | 'unitType' | 'level'>; readonly xp: number; readonly level: number; readonly died: boolean }): string {
  const up = gained.level > gained.hero.level;
  const gain = gained.died ? 'died' : `+${gained.xp} XP${up ? ', level up' : ''}`;
  return `${gained.hero.name}, ${gained.hero.unitType}, level ${gained.level}: ${gain}`;
}
