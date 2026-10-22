/**
 * The player's overrides and the log that replays them.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/domain/player-override.ts.
 * Kept: `force-action` and the log entry stamped in simulated time. Left
 * behind (decision 0030): `swap-behavior`, since a unit type has one fixed
 * action list. The party orders, press on and retreat, are Issue-112's.
 *
 * A force-action names an ability from the unit's own list. It waits for the
 * unit's next turn, uses the ability's own target rule, and is dropped
 * silently if the ability is not usable then.
 */
export type PlayerOverride = { readonly kind: "force-action"; readonly abilityId: string };

/**
 * One entry of the battle's override log. `acceptedAtSimTime` is the battle
 * clock at the turn that used the override, never the wall-clock time of the
 * click: a replay submits each entry before the step that reaches that time
 * and gets the same timeline. An override that was replaced or dropped leaves
 * no entry, because it changed nothing.
 */
export interface OverrideLogEntry {
  readonly acceptedAtSimTime: number;
  readonly unitId: string;
  readonly override: PlayerOverride;
}
