import * as z from 'zod/mini';

import { MAX_PARTY } from '@heat/engine';

/**
 * The last party sent on a job from a camp, kept in the browser so that the
 * job's page opens with it picked (Issue-440; decision 0064). It is a
 * convenience of this browser and nothing the hub knows: it does not follow
 * the player to another device, and it goes with the browser's data.
 */

/** The storage key's prefix; the location and the job's id follow it. */
export const LAST_PARTY_PREFIX = 'heat.party.';

/** A party as the browser kept it: hero ids, a full party's at most. The storage is the player's to edit, so what comes back is checked before the page picks from it. */
const LastPartySchema = z.array(z.string()).check(z.maxLength(MAX_PARTY));

function keyOf(location: string, jobId: string): string {
  return `${LAST_PARTY_PREFIX}${location}.${jobId}`;
}

/** The heroes last sent on the job from the location, by id, or none where nothing was kept or it cannot be read. Whether each is still here is the page's to check. */
export function loadLastParty(location: string, jobId: string): readonly string[] {
  try {
    const text = localStorage.getItem(keyOf(location, jobId));
    if (!text) return [];
    const parsed = LastPartySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function saveLastParty(location: string, jobId: string, heroIds: readonly string[]): void {
  try {
    localStorage.setItem(keyOf(location, jobId), JSON.stringify(heroIds));
  } catch {
    // Without storage, the job's page opens with nobody picked.
  }
}
