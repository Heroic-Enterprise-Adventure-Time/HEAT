import { type AdventureEvent, type AdventureOutcome, CART, CART_UNIT_ID, jobOf, type Line, MONSTERS, RESOURCE_NODES, type Side, type UnitKind } from '@heat/engine';

/**
 * Where everyone stands and how they are, read from the adventure's events
 * alone: what the controls show and what the battle scene draws, the same
 * for a run being played and a stored timeline being replayed, which has no
 * engine (decision 0030). `applyEvent` is the one place an event changes it.
 */

export interface FieldUnit {
  readonly unitId: string;
  readonly side: Side;
  readonly kind: UnitKind;
  /** The unit type, monster type or resource type. */
  readonly type: string;
  readonly name: string;
  readonly line: Line | null;
  readonly health: number;
  readonly maxHealth: number;
}

export interface Field {
  /** The stage under way, or the last one, -1 before the first. */
  readonly stage: number;
  readonly stageKind: string | null;
  /** When the stage began, on the adventure's clock. */
  readonly stageStart: number;
  /** A fight's or a gather's time limit on its own clock, or null outside one. */
  readonly timeLimitMs: number | null;
  /** The party: every hero, by the snapshot's order, standing or down. */
  readonly party: readonly FieldUnit[];
  /**
   * A caravan's cart beside the party (decision 0059): there from the start,
   * broken where it fell until the next stage begins, and null from then on,
   * or on a job that delivers nothing. It is not in `party`, which is the
   * heroes the controls show.
   */
  readonly cart: FieldUnit | null;
  /** The other side of the stage under way; empty outside a fight or a gather. */
  readonly opponents: readonly FieldUnit[];
  /** What has dropped to the party so far, counted up as each enemy falls (decision 0058). */
  readonly drops: readonly { readonly material: string; readonly amount: number }[];
  readonly order: 'press-on' | 'retreat';
  readonly outcome: AdventureOutcome | null;
}

/** A cart's health as it sets out, and the most it has. */
export interface CartStart {
  readonly health: number;
  readonly maxHealth: number;
}

/** The cart a run of this job sets out with: the content's, on a job that delivers; null on any other, or a job this build does not have. */
export function jobCart(jobId: string): CartStart | null {
  return jobOf(jobId)?.deliversTo === undefined ? null : { health: CART.health, maxHealth: CART.health };
}

/** The cart a stored timeline set out with, read from the first battle it stood in; null where it stood in none. */
export function timelineCart(events: readonly AdventureEvent[]): CartStart | null {
  for (const event of events) {
    if (event.kind !== 'battle-start') continue;
    const cart = event.participants.find((p) => p.kind === 'cart');
    if (cart) return { health: cart.health, maxHealth: cart.maxHealth };
  }
  return null;
}

/** The party as the snapshot gives it, and its cart if it has one, before the first event. */
export function emptyField(
  party: readonly { readonly heroId: string; readonly name: string; readonly unitType: string; readonly stats: { readonly maxHealth: number } }[],
  cart: CartStart | null = null,
): Field {
  return {
    cart: cart && { unitId: CART_UNIT_ID, side: 'party', kind: 'cart', type: 'cart', name: CART.name, line: CART.homeLine, ...cart },
    stage: -1,
    stageKind: null,
    stageStart: 0,
    timeLimitMs: null,
    party: party.map((h) => ({
      unitId: h.heroId,
      side: 'party',
      kind: 'hero',
      type: h.unitType,
      name: h.name,
      line: null,
      health: h.stats.maxHealth,
      maxHealth: h.stats.maxHealth,
    })),
    opponents: [],
    drops: [],
    order: 'press-on',
    outcome: null,
  };
}

function opponentName(type: string): string {
  if (Object.hasOwn(MONSTERS, type)) return MONSTERS[type as keyof typeof MONSTERS].name;
  if (Object.hasOwn(RESOURCE_NODES, type)) return RESOURCE_NODES[type as keyof typeof RESOURCE_NODES].name;
  return type;
}

function update(units: readonly FieldUnit[], unitId: string, change: Partial<FieldUnit>): readonly FieldUnit[] {
  return units.some((u) => u.unitId === unitId) ? units.map((u) => (u.unitId === unitId ? { ...u, ...change } : u)) : units;
}

function updateBoth(field: Field, unitId: string, change: Partial<FieldUnit>): Field {
  const cart = field.cart?.unitId === unitId ? { ...field.cart, ...change } : field.cart;
  return { ...field, party: update(field.party, unitId, change), cart, opponents: update(field.opponents, unitId, change) };
}

/** What the party carries with one more drop: added to its resource's line, or a line of its own after the others. */
function withDrop(drops: Field['drops'], drop: { readonly material: string; readonly amount: number }): Field['drops'] {
  if (!drops.some((d) => d.material === drop.material)) return [...drops, { material: drop.material, amount: drop.amount }];
  return drops.map((d) => (d.material === drop.material ? { ...d, amount: d.amount + drop.amount } : d));
}

/** The field after one event. */
export function applyEvent(field: Field, event: AdventureEvent): Field {
  switch (event.kind) {
    case 'stage-start':
      // A broken cart is left where it fell as the next stage begins.
      return { ...field, stage: event.stage, stageKind: event.stageKind, stageStart: event.timestamp, timeLimitMs: null, cart: field.cart && field.cart.health > 0 ? field.cart : null, opponents: [] };
    case 'battle-start': {
      const lines = new Map(event.participants.map((p) => [p.unitId, p.line] as const));
      return {
        ...field,
        timeLimitMs: event.timeLimitMs,
        party: field.party.map((u) => ({ ...u, line: lines.get(u.unitId) ?? null })),
        cart: field.cart && { ...field.cart, line: lines.get(field.cart.unitId) ?? field.cart.line },
        opponents: event.participants
          .filter((p) => p.side === 'opponents')
          .map((p) => ({
            unitId: p.unitId,
            side: p.side,
            kind: p.kind,
            type: p.type,
            name: opponentName(p.type),
            line: p.line,
            health: p.health,
            maxHealth: p.maxHealth,
          })),
      };
    }
    case 'action-resolved': {
      let next = field;
      for (const effect of event.effects) {
        if (effect.kind === 'damage') next = updateBoth(next, effect.targetId, { health: effect.newHealth });
        else if (effect.kind === 'move') next = updateBoth(next, effect.unitId, { line: effect.to });
      }
      return next;
    }
    case 'line-collapsed':
      return event.moves.reduce((next, move) => updateBoth(next, move.unitId, { line: move.to }), field);
    case 'unit-down':
      return updateBoth(field, event.unitId, { health: 0 });
    case 'drop':
      return { ...field, drops: withDrop(field.drops, event) };
    case 'battle-end':
      return { ...field, timeLimitMs: null };
    case 'stage-end':
      return {
        ...field,
        timeLimitMs: null,
        party: event.health.reduce((party, h) => update(party, h.heroId, { health: h.health }), field.party),
        // The engine's own count, which the drops so far have already reached.
        drops: event.drops,
      };
    case 'order':
      return { ...field, order: event.order };
    case 'adventure-end':
      // A party that is all down keeps nothing, so it carries nothing from here (decision 0058).
      return { ...field, outcome: event.outcome, drops: event.outcome === 'defeat' ? [] : field.drops };
    default:
      return field;
  }
}

/**
 * Whether the scene brings units on at this event: the party setting out,
 * or the other side of a fight or a gather arriving. The clock waits there
 * while they come on (the owner's call on Issue-15).
 */
export function isEntry(event: AdventureEvent): boolean {
  return event.kind === 'adventure-start' || (event.kind === 'stage-start' && (event.stageKind === 'fight' || event.stageKind === 'gather'));
}

/**
 * Whole seconds left before the stage's time limit turns the party back,
 * shown only in the last ten (the owner's call on Issue-15, amending
 * decision 0030); null outside them.
 */
export function secondsLeft(field: Field, simTime: number): number | null {
  if (field.timeLimitMs === null || field.outcome !== null) return null;
  const left = field.stageStart + field.timeLimitMs - simTime;
  return left <= 10_000 && left > 0 ? Math.ceil(left / 1000) : null;
}

/**
 * Why a hero's ability buttons wait, in the player's words, or null while
 * they can be used: in a fight or a gather, before the end (angular.md, rule
 * 14). Out of one, the stage's kind says where the party is: on the road,
 * nearly home, or in a fight or a gather that has not begun or has just
 * ended, a window between a stage's events (Issue-168, from the review of
 * PR-254).
 */
export function waitingWords(field: Field): string | null {
  if (field.outcome !== null) return 'The adventure is over.';
  if (field.timeLimitMs !== null) return null;
  switch (field.stageKind) {
    case 'travel':
      return 'On the road: abilities are for a fight or a gather.';
    case 'arrive':
      return 'Nearly home: abilities are for a fight or a gather.';
    default:
      return 'Abilities are for a fight or a gather while it is under way.';
  }
}
