/**
 * Builders for the battle tests. Adapted from the fixtures at the top of
 * BattleScript Online's bso-game-shared/src/combat/engine-api.test.ts
 * (`makeHero`, `makeEnemy`, `buildEncounter`).
 */

import {
  BATTLE_CONTENT,
  type BattleContent,
  type BattleEvent,
  type BattleSetup,
  CombatEngine,
  type CombatProfile,
  type GatherRatings,
  type MonsterProfile,
  type MonsterType,
  type Opponent,
  type PartyMember,
  UNIT_PROFILES,
  type UnitType,
} from "../../src/index.js";

export function hero(unitId: string, unitType: UnitType, health?: number, gather?: GatherRatings): PartyMember {
  const profile = UNIT_PROFILES[unitType];
  if (!profile) throw new Error(`No profile for ${unitType}`);
  return { unitId, unitType, health: health ?? profile.stats.maxHealth, stats: gather ? { ...profile.stats, gather } : profile.stats };
}

export function opponent(unitId: string, type: Opponent["type"]): Opponent {
  return { unitId, type };
}

export function setup(party: readonly PartyMember[], opponents: readonly Opponent[], seed = "seed-1", timeLimitMs = 60_000): BattleSetup {
  return { seed, party, opponents, timeLimitMs };
}

/** The game's content with some hero and monster profiles replaced. */
export function contentWith(changes: {
  heroes?: Partial<Record<UnitType, Partial<CombatProfile>>>;
  monsters?: Partial<Record<MonsterType, Partial<MonsterProfile>>>;
}): BattleContent {
  const heroes = { ...BATTLE_CONTENT.heroes };
  for (const [type, change] of Object.entries(changes.heroes ?? {}) as [UnitType, Partial<CombatProfile>][]) {
    const base = heroes[type];
    if (base) heroes[type] = { ...base, ...change };
  }
  const monsters = { ...BATTLE_CONTENT.monsters };
  for (const [type, change] of Object.entries(changes.monsters ?? {}) as [MonsterType, Partial<MonsterProfile>][]) {
    monsters[type] = { ...monsters[type], ...change };
  }
  return { ...BATTLE_CONTENT, heroes, monsters };
}

/** Run to the end and return every event. */
export function runAll(engine: CombatEngine): BattleEvent[] {
  const events: BattleEvent[] = [];
  while (!engine.isComplete()) events.push(...engine.step());
  return events;
}

export function ofKind<K extends BattleEvent["kind"]>(events: readonly BattleEvent[], kind: K): Extract<BattleEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<BattleEvent, { kind: K }> => e.kind === kind);
}
