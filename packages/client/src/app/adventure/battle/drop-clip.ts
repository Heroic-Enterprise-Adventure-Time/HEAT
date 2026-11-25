/**
 * The arithmetic of a drop's picture (battle.md, "A drop shows twice";
 * decision 0058; Issue-344), apart from the renderer so that it is tested
 * without one: when the icon of what an enemy dropped begins and how long
 * it lasts, how far it has risen and how much of it shows a while after it
 * began, and where the digits of its amount stand beside it. On the
 * presentation clock, the wall clock times the speed, as every clip of the
 * scene is, so the adventure's
 * clock waits for it and the wait shortens at 2× and 4× (decision 0057).
 */

/** How long a drop's icon rises, in presentation time. A taste, set by looking. */
export const DROP_RISE_MS = 600;
/** How far it rises in that time, in art pixels. */
export const DROP_RISE = 14;
/** The last of the rise, over which it fades to nothing. */
export const DROP_FADE_MS = 150;
/** Between one drop of an enemy and its next, where it drops more than one thing, so that each is read. */
export const DROP_STAGGER_MS = 250;
/** Where the icon's middle begins, above the feet of the enemy that dropped it, in art pixels. */
export const DROP_FROM = 14;
/** Where the amount stands: the top left of its row of digits, from the icon's middle, so that it sits on the icon's lower right. */
export const AMOUNT_AT = { x: 3, y: 2 };

/**
 * When an enemy's drop begins and is gone, from now: the first, `index` 0,
 * rises with the enemy's fall, which begins `delay` from now, as the blow
 * or the projectile that felled it lands, and each next one a stagger
 * later. `until` is the length the clock is asked to wait for.
 */
export function dropTime(index: number, delay: number): { readonly from: number; readonly until: number } {
  const from = delay + index * DROP_STAGGER_MS;
  return { from, until: from + DROP_RISE_MS };
}

/**
 * A drop's picture `ms` after it began: how far it has risen, in whole art
 * pixels, quickly at first and slowing to a stop, and how much of it shows,
 * all of it until the fade. Null before it begins and once it is gone.
 */
export function dropAt(ms: number): { readonly lift: number; readonly alpha: number } | null {
  if (ms < 0 || ms >= DROP_RISE_MS) return null;
  const left = 1 - ms / DROP_RISE_MS;
  return { lift: Math.round(DROP_RISE * (1 - left * left)), alpha: Math.min(1, (DROP_RISE_MS - ms) / DROP_FADE_MS) };
}

/**
 * Where the digits of an amount stand in a row, from the row's left edge:
 * each digit's column, by its picture's width, a digit's outline sharing a
 * column with its neighbour's. A digit the font has no picture of is left
 * out of the row; an amount of none of them is a row of nothing.
 */
export function amountRow(
  amount: number,
  widthOf: (digit: string) => number | undefined,
): { readonly digits: readonly { readonly digit: string; readonly x: number }[]; readonly width: number } {
  const digits: { digit: string; x: number }[] = [];
  let x = 0;
  for (const digit of String(amount)) {
    const width = widthOf(digit);
    if (width === undefined) continue;
    digits.push({ digit, x });
    x += width - 1;
  }
  return { digits, width: digits.length > 0 ? x + 1 : 0 };
}
