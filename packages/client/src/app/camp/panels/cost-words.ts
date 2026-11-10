import type { RecruitOffer, UpgradeOffer } from '../../game';

/** A cost in words, each resource beside the camp's balance (game.md, "The page"): a facility's next level, a recruit's price. */
export function costWords(cost: UpgradeOffer['cost']): string {
  return cost.map((c) => `${c.amount} ${c.material}, you have ${c.balance}`).join('; ');
}

/** A recruit's price in words: free for the first villager, else its cost beside the camp's balance. */
export function priceWords(offer: RecruitOffer): string {
  return offer.cost.length === 0 ? 'free' : costWords(offer.cost);
}
