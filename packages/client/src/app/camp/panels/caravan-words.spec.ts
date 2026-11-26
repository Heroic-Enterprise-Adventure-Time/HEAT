import type { AdventureResultView, AdventureView, CampView } from '../../game';
import { caravanReason, cargoLines, cargoWords, cartCapacityAt, freeSlots, loadWords, noWayBackWords, roomWords, stayedWords } from './caravan-words';

const millbrook: CampView = {
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
    // A resource a newer deploy holds and this client's engine does not know: the start could not name it.
    { material: 'stone', balance: 5 },
  ],
  facilities: [{ kind: 'caravan-hub', level: 1 }],
};

const highcrag: CampView = {
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

const caravan: NonNullable<AdventureView['caravan']> = {
  destination: 'highcrag',
  cargo: [
    { material: 'timber', amount: 60 },
    { material: 'ore', amount: 40 },
  ],
  staying: ['h1', 'h2'],
};

/** A caravan's result: how it ended, and what of its cargo the destination's warehouse took and turned away. */
function result(outcome: AdventureResultView['outcome'], delivered: AdventureResultView['delivered'] = [], deliveryLost: AdventureResultView['deliveryLost'] = []): AdventureResultView {
  return { outcome, stages: [], rewards: [], credited: [], lost: [], delivered, deliveryLost, heroes: [] };
}

const names: Readonly<Record<string, string>> = { h1: 'Wren', h2: 'Moss' };
const nameOf = (id: string) => names[id] ?? id;

describe('caravan words', () => {
  it("offers each resource the camp holds, beside its balance and the destination's room for it, and not one the engine does not know", () => {
    expect(cargoLines(millbrook, highcrag)).toEqual([
      { material: 'timber', balance: 90, room: 100 },
      { material: 'ore', balance: 40, room: 30 },
    ]);
  });

  it("says the cart's load against what the hub's level carries, and the hall's free slots", () => {
    expect(cartCapacityAt(millbrook)).toBe(100);
    expect(cartCapacityAt(highcrag)).toBe(0);
    expect(loadWords(60, 100)).toBe('Cargo: 60 of the 100 the cart carries.');
    expect(freeSlots(highcrag)).toBe(2);
    expect(freeSlots({ ...highcrag, activeHeroes: 5 })).toBe(0);
    expect(roomWords(highcrag)).toBe("Highcrag's heroes hall has room for 2 more.");
  });

  it('says a hero who stays cannot come back while the destination has no caravan hub, and nothing once it has one', () => {
    expect(noWayBackWords(highcrag)).toBe('A hero who stays cannot come back until Highcrag has a caravan hub.');
    expect(noWayBackWords({ ...highcrag, facilities: [{ kind: 'caravan-hub', level: 1 }] })).toBeNull();
  });

  it('departs a cargo within the balance and the cart, with no more staying than the hall has room for, and a cargo over the room, which the result accounts for', () => {
    expect(caravanReason(millbrook, highcrag, [{ material: 'timber', amount: 60 }, { material: 'ore', amount: 40 }], 2)).toBeNull();
    expect(caravanReason(millbrook, highcrag, [], 0)).toBeNull();
  });

  it('says why a cargo or who stays cannot depart, in the order the hub refuses them', () => {
    expect(caravanReason(millbrook, highcrag, [{ material: 'timber', amount: 2.5 }], 0)).toBe('Each amount is a whole number, 0 or more.');
    expect(caravanReason(millbrook, highcrag, [{ material: 'timber', amount: Number.NaN }], 0)).toBe('Each amount is a whole number, 0 or more.');
    expect(caravanReason(millbrook, highcrag, [{ material: 'ore', amount: 41 }], 0)).toBe('Millbrook holds only 40 ore.');
    expect(caravanReason(millbrook, highcrag, [{ material: 'timber', amount: 70 }, { material: 'ore', amount: 31 }], 0)).toBe('The cart carries 100 in all.');
    expect(caravanReason(millbrook, highcrag, [], 3)).toBe("Highcrag's heroes hall has room for 2 more.");
  });

  it('says what became of the cargo for each way a caravan ends (decision 0059)', () => {
    // Arrived, cart standing: delivered up to the cap, the rest lost and said.
    expect(cargoWords(caravan, result('complete', [{ material: 'timber', amount: 60 }, { material: 'ore', amount: 30 }], [{ material: 'timber', amount: 0 }, { material: 'ore', amount: 10 }]), 'Millbrook', 'Highcrag')).toEqual([
      'Delivered to Highcrag: 60 timber and 30 ore.',
      "10 ore lost: Highcrag's warehouse was full.",
    ]);
    // A warehouse with no room for any of it took nothing, and the cart still arrived.
    expect(cargoWords(caravan, result('complete', [], [{ material: 'timber', amount: 60 }, { material: 'ore', amount: 40 }]), 'Millbrook', 'Highcrag')).toEqual([
      "60 timber lost: Highcrag's warehouse was full.",
      "40 ore lost: Highcrag's warehouse was full.",
    ]);
    // Arrived, cart broken: nothing delivered and nothing turned away.
    expect(cargoWords(caravan, result('complete'), 'Millbrook', 'Highcrag')).toEqual(['The cart broke on the road, and its cargo was lost.']);
    expect(cargoWords(caravan, result('retreat'), 'Millbrook', 'Highcrag')).toEqual(['The cargo was abandoned in the retreat.']);
    expect(cargoWords(caravan, result('defeat'), 'Millbrook', 'Highcrag')).toEqual(['The cargo was lost with the party.']);
    // Discarded, with no result: the cargo went back.
    expect(cargoWords(caravan, null, 'Millbrook', 'Highcrag')).toEqual(["The cargo went back to Millbrook's warehouse."]);
  });

  it('says nothing of a cargo the caravan did not carry', () => {
    expect(cargoWords({ ...caravan, cargo: [] }, result('complete'), 'Millbrook', 'Highcrag')).toEqual([]);
  });

  it('says who stayed, which a caravan does only by arriving, and nothing where nobody was to stay', () => {
    expect(stayedWords(caravan, result('complete'), 'Highcrag', nameOf)).toBe('Stayed at Highcrag: Wren and Moss.');
    expect(stayedWords({ ...caravan, staying: ['h1'] }, result('complete'), 'Highcrag', nameOf)).toBe('Stayed at Highcrag: Wren.');
    for (const ended of [result('retreat'), result('defeat'), null]) {
      expect(stayedWords(caravan, ended, 'Highcrag', nameOf)).toBe('Nobody stayed at Highcrag: the caravan did not arrive.');
    }
    expect(stayedWords({ ...caravan, staying: [] }, result('complete'), 'Highcrag', nameOf)).toBeNull();
  });
});
