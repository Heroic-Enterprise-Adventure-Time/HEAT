import { type Location, location } from "@heat/engine";

import type { Repository } from "./db/repository.js";
import { badInput } from "./refusals.js";

/**
 * Whether the player has a camp at a location (decision 0059): at the
 * starting location always, and at any other once they hold its unlock.
 *
 * A verb that takes a location refuses one the player has not unlocked,
 * twice, as it holds its other rules: by this read, and by a condition on the
 * unlock's item in its transaction (`unlockHeld` in db/repository.ts). A
 * location that needs no unlock costs neither a read nor a condition.
 *
 * The refusal is BAD_USER_INPUT and not a refusal type: `me.camps` lists the
 * player's camps and an unlock is never taken away, so a page that shows the
 * player's own camps never sends a locked one, and a request that does is the
 * client's defect (graphql.md, rule 6). It says the same for a location the
 * content does not have.
 */

/** Refuses a location the player has no camp at, in the words building has always used. */
export function refuseNoCamp(locationId: string): never {
  badInput(`there is no camp of yours at ${locationId}`);
}

/** The location, when the player has a camp there; BAD_USER_INPUT otherwise. */
export async function campLocation(repo: Repository, playerId: string, locationId: string): Promise<Location> {
  const at = location(locationId);
  if (!at) refuseNoCamp(locationId);
  if (at.unlock !== undefined && !(await repo.unlocks(playerId)).some((held) => held.unlock === at.unlock)) refuseNoCamp(at.id);
  return at;
}
