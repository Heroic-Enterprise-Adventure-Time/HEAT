import { ADVENTURE_CONTENT, type AdventureContent, type AdventureSnapshot, CART, type Job, must, replay, UNIT_PROFILES } from '@heat/engine';

/**
 * A caravan the specs play, since the game's content has none until
 * Issue-354: one bandit on the road between two travels, delivering to
 * Highcrag (decision 0059).
 */
export const SPEC_CARAVAN: Job = {
  id: 'spec-caravan',
  name: 'Spec caravan',
  description: "A caravan the client's specs play.",
  location: 'millbrook',
  facility: 'caravan-hub',
  deliversTo: 'highcrag',
  stages: [{ kind: 'travel', lengthMs: 3000 }, { kind: 'fight', opponents: [{ type: 'bandit', count: 1 }], timeLimitMs: 60_000 }, { kind: 'travel', lengthMs: 3000 }, { kind: 'arrive' }],
  pay: [],
  bonusXp: 0,
};

/** The game's content with the spec caravan in it, and the cart at the health given. */
export function caravanContent(cartHealth: number = CART.health): AdventureContent {
  return {
    ...ADVENTURE_CONTENT,
    battle: { ...ADVENTURE_CONTENT.battle, cart: { ...CART, health: cartHealth } },
    jobs: { ...ADVENTURE_CONTENT.jobs, [SPEC_CARAVAN.id]: SPEC_CARAVAN },
  };
}

/** A lone fighter's snapshot for a job. */
export const fighterOn = (jobId: string): AdventureSnapshot => ({
  version: 'v1',
  jobId,
  heroes: [{ heroId: 'h1', name: 'Wat', unitType: 'fighter', spriteSet: 'fighter-02', level: 1, stats: must(UNIT_PROFILES.fighter, 'the fighter profile').stats }],
});

/** The spec caravan played by a lone fighter, with the cart at the health given. */
export const caravanTimeline = (cartHealth?: number) => replay(fighterOn(SPEC_CARAVAN.id), 'seed-1', [], caravanContent(cartHealth)).timeline;
