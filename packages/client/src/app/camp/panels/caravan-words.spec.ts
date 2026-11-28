import type { Material } from '@heat/engine';

import type { AdventureResultView, AdventureView, CampView } from '../../game';
import { CARAVAN_ORIGIN, CARAVAN_DESTINATION as highcrag } from '../../testing/caravan-camps';
import { caravanReason, cargoLines, cargoRows, cargoWords, cartCapacityAt, freeSlots, loadWords, noWayBackWords, roomWords, stayedWords } from './caravan-words';

// A resource a newer deploy holds and this client's engine does not know: the start could not name it.
const millbrook: CampView = { ...CARAVAN_ORIGIN, holdings: [...CARAVAN_ORIGIN.holdings, { material: 'marble', balance: 5 }] };

const caravan: NonNullable<AdventureView['caravan']> = {
  destination: 'highcrag',
  cargo: [
    { material: 'timber', amount: 60 },
    { material: 'ore', amount: 40 },
  ],
  staying: ['h1', 'h2'],
  riders: [],
};
// The same caravan with two riders beside the two of its party who stay: the caravan names them, the snapshot does not.
const ridden: typeof caravan = { ...caravan, staying: ['h1', 'h2', 'h7', 'h8'], riders: [{ heroId: 'h7', name: 'Cora' }, { heroId: 'h8', name: 'Fenn' }] };

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
    expect(caravanReason(millbrook, highcrag, [{ material: 'ore', amount: 41 }], 0)).toBe('Millbrook holds only 40 ore.');
    expect(caravanReason(millbrook, highcrag, [{ material: 'timber', amount: 70 }, { material: 'ore', amount: 31 }], 0)).toBe('The cart carries 100 in all.');
    expect(caravanReason(millbrook, highcrag, [], 3)).toBe("Highcrag's heroes hall has room for 2 more.");
  });

  it('steps each resource by 1, 10 and 100 either way, from 0 to the most the camp holds and the cart has left (Issue-386)', () => {
    const lines = cargoLines(millbrook, highcrag);
    const [timber, ore] = cargoRows(lines, new Map<Material, number>(), 100);
    expect(timber?.amount).toBe(0);
    expect(timber?.down.map((s) => [s.label, s.to, s.disabled])).toEqual([['\u2212100', 0, true], ['\u221210', 0, true], ['\u22121', 0, true]]);
    expect(timber?.up.map((s) => [s.label, s.to, s.disabled])).toEqual([['+1', 1, false], ['+10', 10, false], ['+100', 90, false]]);
    expect(ore?.up.map((s) => s.to)).toEqual([1, 10, 40]);

    // 70 timber leaves the cart room for 30 more: ore steps up to 30, though the camp holds 40.
    const [loaded, rest] = cargoRows(lines, new Map<Material, number>([['timber', 70]]), 100);
    expect(loaded?.down.map((s) => s.to)).toEqual([0, 60, 69]);
    expect(loaded?.up.map((s) => s.to)).toEqual([71, 80, 90]);
    expect(rest?.up.map((s) => s.to)).toEqual([1, 10, 30]);

    // A full cart steps nothing up, and every resource can still come down.
    const full = cargoRows(lines, new Map<Material, number>([['timber', 60], ['ore', 40]]), 100);
    expect(full.flatMap((row) => row.up.map((s) => s.disabled))).toEqual([true, true, true, true, true, true]);
    expect(full.flatMap((row) => row.down.map((s) => s.disabled))).toEqual([false, false, false, false, false, false]);
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
    expect(stayedWords(caravan, result('complete'), 'Millbrook', 'Highcrag', nameOf)).toEqual(['Stayed at Highcrag: Wren and Moss.']);
    expect(stayedWords({ ...caravan, staying: ['h1'] }, result('complete'), 'Millbrook', 'Highcrag', nameOf)).toEqual(['Stayed at Highcrag: Wren.']);
    for (const ended of [result('retreat'), result('defeat'), null]) {
      expect(stayedWords(caravan, ended, 'Millbrook', 'Highcrag', nameOf)).toEqual(['Nobody stayed at Highcrag: the caravan did not arrive.']);
    }
    expect(stayedWords({ ...caravan, staying: [] }, result('complete'), 'Millbrook', 'Highcrag', nameOf)).toEqual([]);
  });

  it('says who rode along on a line of their own, by the names the caravan holds, and that they are back where it did not arrive, a party all down included (Issue-391)', () => {
    expect(stayedWords(ridden, result('complete'), 'Millbrook', 'Highcrag', nameOf)).toEqual(['Stayed at Highcrag: Wren and Moss.', 'Rode along to Highcrag: Cora and Fenn.']);
    for (const ended of [result('retreat'), result('defeat'), null]) {
      expect(stayedWords(ridden, ended, 'Millbrook', 'Highcrag', nameOf)).toEqual(['Nobody stayed at Highcrag: the caravan did not arrive.', 'Cora and Fenn rode along and are back at Millbrook.']);
    }
    // Riders alone: nobody of the party was to stay.
    const one = { ...ridden, staying: ['h7'], riders: [{ heroId: 'h7', name: 'Cora' }] };
    expect(stayedWords(one, result('complete'), 'Millbrook', 'Highcrag', nameOf)).toEqual(['Rode along to Highcrag: Cora.']);
    expect(stayedWords(one, result('defeat'), 'Millbrook', 'Highcrag', nameOf)).toEqual(['Nobody stayed at Highcrag: the caravan did not arrive.', 'Cora rode along and is back at Millbrook.']);
  });
});
