import { cartCapacity, type Material, MATERIALS } from '@heat/engine';

import type { AdventureResultView, AdventureView, CampView } from '../../game';

/**
 * A caravan in the player's words (game.md, "Caravans"; decision 0059): what
 * its page offers to carry and to leave, why it cannot depart as picked, and
 * what its result says of the cargo and of who stays. The rules the hub
 * checks again, a cargo against the balance and the cart and who stays
 * against the destination's hall, are checked here before asking, as a
 * recruit's price is (angular.md, rule 6).
 */

type Caravan = NonNullable<AdventureView['caravan']>;
interface Amount {
  readonly amount: number;
  readonly material: string;
}

const isMaterial = (material: string): material is Material => (MATERIALS as readonly string[]).includes(material);

/** One resource a caravan can carry: what the camp holds of it, and the room the destination's warehouse has left for it. */
export interface CargoLine {
  readonly material: Material;
  readonly balance: number;
  readonly room: number;
}

/**
 * What the camp can load, each resource it holds beside the room the
 * destination has for it. The room is shown here, where a job's page shows
 * none for a drop, because the cargo is the player's own choice and names
 * nothing hidden; a cargo over it is not refused, and the result says what
 * the cap lost. A resource this client's engine does not know is not
 * offered, since the start could not name it.
 */
export function cargoLines(origin: CampView, destination: CampView): CargoLine[] {
  return origin.holdings.flatMap(({ material, balance }) => {
    if (balance <= 0 || !isMaterial(material)) return [];
    const there = destination.holdings.find((h) => h.material === material)?.balance ?? 0;
    return [{ material, balance, room: Math.max(0, destination.resourceCapacity - there) }];
  });
}

/** What the camp's cart carries in all, by its caravan hub's level (decision 0059). */
export function cartCapacityAt(camp: CampView): number {
  return cartCapacity(camp.facilities.find((f) => f.kind === 'caravan-hub')?.level ?? 0);
}

/** The slots the camp's heroes hall has free, which the heroes who stay take. */
export function freeSlots(camp: CampView): number {
  return Math.max(0, camp.heroCapacity - camp.activeHeroes);
}

/** The destination hall's room, beside who stays: "Highcrag's heroes hall has room for 2 more." */
export function roomWords(destination: CampView): string {
  return `${destination.name}'s heroes hall has room for ${freeSlots(destination)} more.`;
}

/** The cargo's total against the cart's: "Cargo: 60 of the 100 the cart carries." */
export function loadWords(total: number, capacity: number): string {
  return `Cargo: ${total} of the ${capacity} the cart carries.`;
}

/**
 * What a hero who stays cannot undo, where the destination's camp has no
 * caravan hub to send one back (decision 0059: one direction per hub); null
 * where it has one.
 */
export function noWayBackWords(destination: CampView): string | null {
  const hub = destination.facilities.find((f) => f.kind === 'caravan-hub')?.level ?? 0;
  return hub > 0 ? null : `A hero who stays cannot come back until ${destination.name} has a caravan hub.`;
}

/**
 * Why the caravan cannot depart as picked, or null when it can: an amount
 * that is not a whole number of 0 or more, more of a resource than the camp
 * holds, more in all than the cart carries, or more heroes staying than the
 * destination's hall has room for. The hub refuses the same with
 * BAD_USER_INPUT, InsufficientResources and HallFull.
 */
export function caravanReason(
  origin: CampView,
  destination: CampView,
  cargo: readonly { readonly material: string; readonly amount: number }[],
  staying: number,
): string | null {
  if (cargo.some((c) => !Number.isInteger(c.amount) || c.amount < 0)) return 'Each amount is a whole number, 0 or more.';
  for (const c of cargo) {
    const balance = origin.holdings.find((h) => h.material === c.material)?.balance ?? 0;
    if (c.amount > balance) return `${origin.name} holds only ${balance} ${c.material}.`;
  }
  const capacity = cartCapacityAt(origin);
  if (cargo.reduce((sum, c) => sum + c.amount, 0) > capacity) return `The cart carries ${capacity} in all.`;
  if (staying > freeSlots(destination)) return roomWords(destination);
  return null;
}

const listWords = (items: readonly string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const total = (amounts: readonly Amount[]) => amounts.reduce((sum, a) => sum + a.amount, 0);

/**
 * What became of a caravan's cargo, one line for each row of decision 0059's
 * table: delivered up to the destination's cap, the rest lost and said; lost
 * with a broken cart, which delivers and loses nothing; abandoned in a
 * retreat; lost with a party all down; and returned to the camp it left
 * when no deploy could verify the run and it was discarded, the result
 * null. Nothing for a caravan that carried nothing, or an outcome this
 * client does not know.
 */
export function cargoWords(caravan: Caravan, result: AdventureResultView | null, origin: string, destination: string): string[] {
  if (caravan.cargo.length === 0) return [];
  if (!result) return [`The cargo went back to ${origin}'s warehouse.`];
  switch (result.outcome) {
    case 'complete': {
      if (total(result.delivered) + total(result.deliveryLost) === 0) return ['The cart broke on the road, and its cargo was lost.'];
      const delivered = result.delivered.filter((d) => d.amount > 0);
      return [
        ...(delivered.length > 0 ? [`Delivered to ${destination}: ${listWords(delivered.map((d) => `${d.amount} ${d.material}`))}.`] : []),
        ...result.deliveryLost.filter((l) => l.amount > 0).map((l) => `${l.amount} ${l.material} lost: ${destination}'s warehouse was full.`),
      ];
    }
    case 'retreat':
      return ['The cargo was abandoned in the retreat.'];
    case 'defeat':
      return ['The cargo was lost with the party.'];
    default:
      return [];
  }
}

/** Who stayed at the destination, which a caravan does only by arriving, the dead too (decision 0059); null where nobody was to stay. */
export function stayedWords(caravan: Caravan, result: AdventureResultView | null, destination: string, nameOf: (heroId: string) => string): string | null {
  if (caravan.staying.length === 0) return null;
  return result?.outcome === 'complete'
    ? `Stayed at ${destination}: ${listWords(caravan.staying.map(nameOf))}.`
    : `Nobody stayed at ${destination}: the caravan did not arrive.`;
}
