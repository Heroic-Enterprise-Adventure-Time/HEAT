import { FACILITIES, type FacilityKind, type Job, jobFacilityLevel, jobsPostedBy, location, UNLOCKS } from '@heat/engine';

/**
 * A job in the player's words. The page tells a job by its description, its
 * pay and its bonus XP, and nothing of its stages or of what its enemies
 * drop: the description says as much or as little as its author chose, and
 * the rest is the player's to find (decision 0058; the owner, 2026-11-20,
 * Issue-339, on the stages).
 */

/** The jobs a poster at a location lists, the job board or a facility, in the content's order (Issue-133), a caravan among them (Issue-355). */
export function jobsAt(at: string, poster: FacilityKind): Job[] {
  return jobsPostedBy(at, poster);
}

export function jobAt(at: string, poster: FacilityKind, id: string | null | undefined): Job | undefined {
  return jobsAt(at, poster).find((job) => job.id === id);
}

/**
 * The poster a job's address names: the job board, whose route names no
 * facility, or the facility in the address; null for no such facility.
 */
export function posterOf(facility: string | null | undefined): FacilityKind | null {
  if (!facility) return 'job-board';
  return Object.hasOwn(FACILITIES, facility) ? (facility as FacilityKind) : null;
}

/**
 * The job an address names under its poster, which posts its jobs only once
 * built (game.md, "Locations and camps"); undefined for no such job. The job
 * board is always there.
 */
export function postedJob(at: string, poster: FacilityKind | null, posterLevel: number, id: string | null | undefined): Job | undefined {
  if (!poster || (poster !== 'job-board' && posterLevel < 1)) return undefined;
  return jobAt(at, poster, id);
}

/**
 * Why a job cannot be started yet, where the reason is the player's to fix
 * and not hidden: a caravan to a location the player has no camp at, which
 * needs that location's unlock (decision 0059). The words name the unlock
 * and not what grants it, since a job's description chooses whether to say
 * what it grants (game.md, "Unlocks"); and a job its facility's level does
 * not post yet, which needs that level (Issue-357), as the hub's refusal says.
 * Null for a job that can be started; and, for the unlock alone, while the
 * player's camps are not read yet (`campsAt` null), so that no route is said
 * to be locked before the page knows.
 */
export function lockedWords(job: Job, campsAt: readonly string[] | null, facilities: readonly { readonly kind: FacilityKind; readonly level: number }[]): string | null {
  const needed = jobFacilityLevel(job);
  if (job.facility && (facilities.find((f) => f.kind === job.facility)?.level ?? 0) < needed) {
    return `Needs a level ${needed} ${FACILITIES[job.facility].name.toLowerCase()}.`;
  }
  if (campsAt === null || job.deliversTo === undefined || campsAt.includes(job.deliversTo)) return null;
  const unlock = location(job.deliversTo)?.unlock;
  if (!unlock) return null;
  const name = UNLOCKS[unlock].name;
  return `Needs ${name.charAt(0).toLowerCase()}${name.slice(1)}.`;
}

/** What a job says in place of its pay when whoever posted it pays nothing. */
export const NO_PAY = 'No pay';

/** One resource of a job's pay, "3 cloth". */
export function rewardWords(reward: { readonly amount: number; readonly material: string }): string {
  return `${reward.amount} ${reward.material}`;
}

/** A job's bonus on its poster's list, beside its pay's chips: "4 bonus XP". */
export function bonusXpWords(job: Job): string {
  return `${job.bonusXp} bonus XP`;
}

/** A job's bonus on its own page: "Bonus: 4 XP to each hero who arrives." */
export function bonusWords(job: Job): string {
  return `Bonus: ${job.bonusXp} XP to each hero who arrives.`;
}

/**
 * What a retreat keeps, the one rule for every job (decision 0058): what
 * dropped and the XP of what the party put down, and neither the pay nor the
 * bonus. The pay is named only where the job has some, and a caravan's
 * cargo, which a retreat abandons (decision 0059), where the job delivers.
 */
export function retreatWords(job: Job): string {
  const lost = [...(job.pay.length > 0 ? ['the pay'] : []), 'the bonus', ...(job.deliversTo === undefined ? [] : ['the cargo'])];
  const words = lost.length === 1 ? lost[0] : `${lost.slice(0, -1).join(', ')} and ${lost.at(-1)}`;
  return `A retreat keeps what dropped and the XP earned, and loses ${words}.`;
}
