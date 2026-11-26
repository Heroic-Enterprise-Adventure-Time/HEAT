import type { CampView } from '../game';

/** Millbrook with its caravan hub built, holding timber and ore and no cloth: the camp a caravan's specs set out from (Issue-355). */
export const CARAVAN_ORIGIN: CampView = {
  location: 'millbrook',
  name: 'Millbrook',
  hallLevel: 1,
  heroCapacity: 4,
  activeHeroes: 3,
  livingHeroes: 3,
  warehouseLevel: 2,
  resourceCapacity: 200,
  holdings: [
    { material: 'timber', balance: 90 },
    { material: 'ore', balance: 40 },
    { material: 'cloth', balance: 0 },
  ],
  facilities: [
    { kind: 'heroes-hall', level: 1 },
    { kind: 'warehouse', level: 2 },
    { kind: 'mine', level: 1 },
    { kind: 'lumber-camp', level: 0 },
    { kind: 'caravan-hub', level: 1 },
  ],
};

/** Highcrag's camp with two of its four slots taken and 70 ore in a warehouse of 100: where a caravan's specs deliver. */
export const CARAVAN_DESTINATION: CampView = {
  location: 'highcrag',
  name: 'Highcrag',
  hallLevel: 1,
  heroCapacity: 4,
  activeHeroes: 2,
  livingHeroes: 2,
  warehouseLevel: 1,
  resourceCapacity: 100,
  holdings: [{ material: 'ore', balance: 70 }],
  facilities: [
    { kind: 'heroes-hall', level: 1 },
    { kind: 'warehouse', level: 1 },
  ],
};
