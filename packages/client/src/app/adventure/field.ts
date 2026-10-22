import { MONSTERS, RESOURCE_NODES, type AdventureEvent, type Line, type Side } from '@heat/engine';

/**
 * Where everyone stands and how they are, read from the adventure's events
 * alone: what the controls show and what the battle scene draws, the same
 * for a run being played and a stored timeline being replayed, which has no
 * engine (decision 0030). `applyEvent` is the one place an event changes it.
 */

export interface FieldUnit {
  readonly unitId: string;
  readonly side: Side;
  readonly kind: 'hero' | 'monster' | 'resource';
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
  /** The other side of the stage under way; empty outside a fight or a gather. */
  readonly opponents: readonly FieldUnit[];
  /** What the party carries so far. */
  readonly cargo: readonly { readonly material: string; readonly amount: number }[];
  readonly order: 'press-on' | 'retreat';
  readonly outcome: 'complete' | 'retreat' | 'defeat' | null;
}

/** The party as the snapshot gives it, before the first event. */
export function emptyField(party: readonly { readonly heroId: string; readonly name: string; readonly unitType: string; readonly stats: { readonly maxHealth: number } }[]): Field {
  return {
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
    cargo: [],
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
  return { ...field, party: update(field.party, unitId, change), opponents: update(field.opponents, unitId, change) };
}

/** The field after one event. */
export function applyEvent(field: Field, event: AdventureEvent): Field {
  switch (event.kind) {
    case 'stage-start':
      return { ...field, stage: event.stage, stageKind: event.stageKind, stageStart: event.timestamp, timeLimitMs: null, opponents: [] };
    case 'battle-start': {
      const lines = new Map(event.participants.map((p) => [p.unitId, p.line] as const));
      return {
        ...field,
        timeLimitMs: event.timeLimitMs,
        party: field.party.map((u) => ({ ...u, line: lines.get(u.unitId) ?? null })),
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
        if (effect.kind === 'damage' || effect.kind === 'harvest') next = updateBoth(next, effect.targetId, { health: effect.newHealth });
        else if (effect.kind === 'move') next = updateBoth(next, effect.unitId, { line: effect.to });
      }
      return next;
    }
    case 'line-collapsed':
      return event.moves.reduce((next, move) => updateBoth(next, move.unitId, { line: move.to }), field);
    case 'unit-down':
      return updateBoth(field, event.unitId, { health: 0 });
    case 'battle-end':
      return { ...field, timeLimitMs: null };
    case 'stage-end':
      return {
        ...field,
        timeLimitMs: null,
        party: event.health.reduce((party, h) => update(party, h.heroId, { health: h.health }), field.party),
        cargo: event.cargo,
      };
    case 'order':
      return { ...field, order: event.order };
    case 'adventure-end':
      return { ...field, outcome: event.outcome };
    default:
      return field;
  }
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
