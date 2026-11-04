/**
 * The frozen snapshot the hub issues at the start of an adventure
 * (architecture overview, "The adventure loop"; decision 0030).
 *
 * It holds only the party's effective numbers and the job by id. The job's
 * stages, the monsters and the abilities are read from the static content by
 * the version that verifies, never frozen here. The seed travels beside it.
 */

import type { UnitStats } from "../battle/index.js";
import type { UnitType } from "../content.js";

/** The most heroes a party takes; the fewest is one. */
export const MAX_PARTY = 4;

export interface SnapshotHero {
  readonly heroId: string;
  readonly unitType: UnitType;
  readonly name: string;
  readonly spriteSet: string;
  readonly level: number;
  /** Effective stats, with whatever the hero's level and picks add. A hero sets out at full health. */
  readonly stats: UnitStats;
}

export interface AdventureSnapshot {
  /** The version that issued the adventure, carried and never read by the engine. */
  readonly version: string;
  readonly jobId: string;
  readonly heroes: readonly SnapshotHero[];
}
