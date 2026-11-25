import { must } from '@heat/engine';

import type { PlayerView } from '../game';

/**
 * A player once the road is open, as the hub then answers (decision 0059): an
 * empty camp at Highcrag beside the camp they had, holding nothing, and the
 * road's unlock, naming the adventure that first earned it.
 */
export function withHighcrag(player: PlayerView): PlayerView {
  const highcrag = { ...must(player.camps[0], 'the camp the player had'), location: 'highcrag', name: 'Highcrag', activeHeroes: 0, livingHeroes: 0, holdings: [] };
  return { ...player, camps: [...player.camps, highcrag], unlocks: [{ unlock: 'road-to-highcrag', adventureId: 'a0' }] };
}
