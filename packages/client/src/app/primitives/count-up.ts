import { clamp } from 'es-toolkit';

/** How long one amount takes to count up from nothing, in milliseconds: brief (the owner, 2026-11-28, Issue-441). */
export const COUNT_MS = 500;
/** The longest a whole block of amounts takes to count up; where there are more amounts than fit at `COUNT_MS` each, each takes an equal share of this. */
export const COUNT_TOTAL_MS = 3000;

/** One amount part of the way through its count. */
export interface Counted {
  /** What the amount shows now, a whole number from nothing to the amount. */
  readonly shown: number;
  /** Whether its count is over, and what follows from the whole amount, such as a level gained, may be shown. */
  readonly done: boolean;
}

/** How long each of the amounts that count takes: an amount of nothing has nothing to count and takes no time. */
function eachMs(amounts: readonly number[]): number {
  const counting = amounts.filter((amount) => amount > 0).length;
  return counting === 0 ? 0 : Math.min(COUNT_MS, COUNT_TOTAL_MS / counting);
}

/** How long the amounts take to count up, all of them, one after the other. */
export function countMs(amounts: readonly number[]): number {
  return eachMs(amounts) * amounts.filter((amount) => amount > 0).length;
}

/**
 * What each amount shows `elapsedMs` after the count began: they count up
 * from nothing one after the other, in the order given, each quickly at
 * first and slowing into its whole amount, and an amount of nothing is done
 * when its turn comes. Past the end, as at once for a player who has asked
 * for less motion, every amount is whole.
 */
export function countedAt(amounts: readonly number[], elapsedMs: number): Counted[] {
  const each = eachMs(amounts);
  let begins = 0;
  return amounts.map((amount) => {
    if (amount <= 0) return { shown: amount, done: elapsedMs >= begins };
    const share = clamp((elapsedMs - begins) / each, 0, 1);
    begins += each;
    return { shown: Math.round(amount * (1 - (1 - share) ** 2)), done: share >= 1 };
  });
}
