import { type FacilityKind, type Job, jobsPostedBy } from '@heat/engine';

/**
 * A job in the player's words. The page tells a job by its description, its
 * pay and its bonus XP, and nothing of its stages or of what its enemies
 * drop: the description says as much or as little as its author chose, and
 * the rest is the player's to find (decision 0058; the owner, 2026-11-20,
 * Issue-339, on the stages).
 */

/** The jobs a poster at a location lists, the job board or a facility, in the content's order (Issue-133). */
export function jobsAt(location: string, poster: FacilityKind): Job[] {
  return jobsPostedBy(location, poster);
}

export function jobAt(location: string, poster: FacilityKind, id: string | null | undefined): Job | undefined {
  return jobsAt(location, poster).find((job) => job.id === id);
}

/** What a job says in place of its pay when whoever posted it pays nothing. */
export const NO_PAY = 'No pay';

/** One resource of a job's pay, "3 cloth". */
export function rewardWords(reward: { readonly amount: number; readonly material: string }): string {
  return `${reward.amount} ${reward.material}`;
}

/** A job's pay in words, "3 cloth", "10 cloth and 5 ore", or "No pay". */
export function payWords(job: Job): string {
  return job.pay.length === 0 ? NO_PAY : job.pay.map(rewardWords).join(' and ');
}

/** A job on its poster's list, by its pay and its bonus: "3 cloth, 4 bonus XP", "No pay, 2 bonus XP". */
export function boardWords(job: Job): string {
  return `${payWords(job)}, ${job.bonusXp} bonus XP`;
}

/** A job's bonus on its own page: "Bonus: 4 XP to each hero who arrives." */
export function bonusWords(job: Job): string {
  return `Bonus: ${job.bonusXp} XP to each hero who arrives.`;
}

/**
 * What a retreat keeps, the one rule for every job (decision 0058): what
 * dropped and the XP of what the party put down, and neither the pay nor the
 * bonus. The pay is named only where the job has some.
 */
export function retreatWords(job: Job): string {
  return `A retreat keeps what dropped and the XP earned, and loses ${job.pay.length > 0 ? 'the pay and the bonus' : 'the bonus'}.`;
}
