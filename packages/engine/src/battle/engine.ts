/**
 * The battle engine: a charge-time loop that its caller steps to the next
 * event.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/combat/engine.ts.
 * Kept: `CombatEngine` and its stepping API (`step()`, `isComplete()`,
 * `getNextEventTime()`, `getCurrentSimTime()`, `submitOverride()`,
 * `getOutcome()`), charge timers with the same-tick ordering by id, the
 * declare, warmup and resolve lifecycle, the pending override consumed at the
 * unit's next turn and logged in simulated time, and the headless entry
 * point. Left behind (decision 0030): behavior sets and their swaps, status
 * effects, resource pools, traits, equipment, skill trees, presentation cues,
 * the grid's rows and the outcome's wall-clock `createdAt`. Changed: the time
 * limit is the caller's and ends the battle as `timeout`, not a draw; when a
 * side's front line empties every unit on it moves up one line as one event,
 * also at the start; a guard redirects hits; resource nodes are units that
 * never act.
 *
 * Nothing here reads a clock. The caller decides when to step: a live client
 * paced by wall-clock time, or the hub replaying an override log as fast as it
 * can. Both get the same timeline.
 */

import { BATTLE_CONTENT } from "../content.js";
import type { Material } from "../index.js";
import type { AbilityDefinition } from "./ability.js";
import {
  BATTLE_TIMELINE_SCHEMA_VERSION,
  type BattleEvent,
  type BattleOutcome,
  type BattleResult,
  type ResolvedEffect,
} from "./events.js";
import type { OverrideLogEntry, PlayerOverride } from "./override.js";
import { selectAction, selectForced } from "./resolution.js";
import { SeededRng } from "./rng.js";
import type { ActionContext, ActionSelection, DeclaredAction, UnitState } from "./state.js";
import { lineAhead, type BattleContent, type BattleSetup, type ParticipantSnapshot, type Side } from "./unit.js";

/** The charge time of a unit, in whole milliseconds: speed is turns per ten seconds. */
export function chargeMs(speed: number): number {
  return Math.max(1, Math.round(10_000 / speed));
}

/**
 * The next unit to act: the living, acting unit with the smallest charge
 * timer, an exact tie going to the unit whose id sorts first. Within one
 * tick, one unit's turn completes before the next begins, in this order.
 */
export function findNextUnit(states: readonly UnitState[]): UnitState | undefined {
  let best: UnitState | undefined;
  for (const s of states) {
    if (!s.alive || !s.acts) continue;
    if (!best || s.chargeTimer < best.chargeTimer || (s.chargeTimer === best.chargeTimer && s.unitId < best.unitId)) {
      best = s;
    }
  }
  return best;
}

/** A record read by a key the caller has checked with `Object.hasOwn`. */
function lookup<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return record[key];
}

function resolveAbilities(ids: readonly string[], content: BattleContent): AbilityDefinition[] {
  return ids.map((id) => {
    const ability = content.abilities[id];
    if (!ability) throw new Error(`Unknown ability ${id}`);
    return ability;
  });
}

function buildStates(setup: BattleSetup, content: BattleContent, rng: SeededRng): UnitState[] {
  const states: UnitState[] = [];
  const firstCharge = (speed: number): number => {
    const full = chargeMs(speed);
    return rng.nextInt(Math.ceil(full / 2), full);
  };

  for (const member of setup.party) {
    const profile = content.heroes[member.unitType];
    if (!profile) throw new Error(`Unit type ${member.unitType} has no combat profile`);
    if (member.health <= 0 || member.health > member.stats.maxHealth) {
      throw new Error(`Hero ${member.unitId} has health ${String(member.health)} of ${String(member.stats.maxHealth)}`);
    }
    states.push({
      unitId: member.unitId,
      kind: "hero",
      type: member.unitType,
      side: "party",
      stats: member.stats,
      actions: resolveAbilities(profile.actions, content),
      acts: true,
      health: member.health,
      line: profile.homeLine,
      chargeTimer: firstCharge(member.stats.speed),
      currentAction: null,
      guard: null,
      alive: true,
    });
  }

  for (const opponent of setup.opponents) {
    const monster = Object.hasOwn(content.monsters, opponent.type) ? lookup(content.monsters, opponent.type) : undefined;
    const node = Object.hasOwn(content.resources, opponent.type) ? lookup(content.resources, opponent.type) : undefined;
    if (monster) {
      states.push({
        unitId: opponent.unitId,
        kind: "monster",
        type: opponent.type,
        side: "opponents",
        stats: monster.stats,
        actions: resolveAbilities(monster.actions, content),
        acts: true,
        health: monster.stats.maxHealth,
        line: monster.homeLine,
        chargeTimer: firstCharge(monster.stats.speed),
        currentAction: null,
        guard: null,
        alive: true,
      });
    } else if (node) {
      states.push({
        unitId: opponent.unitId,
        kind: "resource",
        type: opponent.type,
        side: "opponents",
        stats: { maxHealth: node.amount, speed: 0, damage: 0, gathering: 0 },
        actions: [],
        material: node.material,
        acts: false,
        health: node.amount,
        line: node.homeLine,
        chargeTimer: 0,
        currentAction: null,
        guard: null,
        alive: true,
      });
    } else {
      throw new Error(`Unknown opponent type ${opponent.type}`);
    }
  }

  const ids = new Set(states.map((s) => s.unitId));
  if (ids.size !== states.length) throw new Error("Unit ids must be unique within a battle");
  return states;
}

/**
 * The battle engine. Units take turns as their charge timers fill, until one
 * side is down or the time limit is reached.
 *
 * Actions follow a declare, warmup, resolve lifecycle. During warmup, other
 * units keep acting.
 */
export class CombatEngine {
  private readonly rng: SeededRng;
  private readonly content: BattleContent;
  private readonly events: BattleEvent[] = [];
  private readonly states: UnitState[];
  private readonly byId: ReadonlyMap<string, UnitState>;
  private readonly participants: readonly ParticipantSnapshot[];
  private readonly gathered: Partial<Record<Material, number>> = {};
  private clock = 0;

  // Lifecycle flags for the stepping API.
  private started = false;
  private completed = false;
  private finalResult: BattleResult | null = null;

  // Per-unit pending override. A new submission replaces any prior pending entry.
  // The engine consumes the pending override at the unit's next turn start.
  private readonly pendingOverrides = new Map<string, PlayerOverride>();

  // Every override the engine has used, in the order it used them.
  private readonly overrideLog: OverrideLogEntry[] = [];

  constructor(
    private readonly setup: BattleSetup,
    content: BattleContent = BATTLE_CONTENT,
  ) {
    if (setup.party.length === 0 || setup.opponents.length === 0) {
      throw new Error("A battle needs a party and at least one opponent");
    }
    if (!Number.isInteger(setup.timeLimitMs) || setup.timeLimitMs <= 0) {
      throw new Error("The time limit is a positive whole number of milliseconds");
    }
    this.content = content;
    this.rng = new SeededRng(setup.seed);
    this.states = buildStates(setup, content, this.rng);
    this.byId = new Map(this.states.map((s) => [s.unitId, s]));
    this.participants = this.states.map((s) => ({
      unitId: s.unitId,
      kind: s.kind,
      type: s.type,
      side: s.side,
      line: s.line,
      health: s.health,
      maxHealth: s.stats.maxHealth,
    }));
  }

  // ── Public stepping API ──────────────────────────────────────────

  /** True once `battle-end` has been emitted. */
  isComplete(): boolean {
    return this.completed;
  }

  /** Current simulation clock in milliseconds. 0 before the first step. */
  getCurrentSimTime(): number {
    return this.clock;
  }

  /**
   * The simulated time at which the next step's events happen: the next
   * unit's turn, or the time limit if that comes first.
   *
   * Before the first `step()`: 0 (the next step emits `battle-start`).
   * After `battle-end`: the current clock.
   */
  getNextEventTime(): number {
    if (!this.started) return 0;
    if (this.completed) return this.clock;
    const next = findNextUnit(this.states);
    return next ? Math.min(this.clock + next.chargeTimer, this.setup.timeLimitMs) : this.setup.timeLimitMs;
  }

  /**
   * Advance the simulation to the next moment something happens and return
   * the events emitted by this step (only the new ones).
   *
   * The first call emits `battle-start` at clock 0, with any line collapse
   * the starting lines need. Once `isComplete()` returns true, further calls
   * return an empty array.
   */
  step(): readonly BattleEvent[] {
    if (this.completed) return [];
    const startIdx = this.events.length;

    if (!this.started) {
      this.events.push({ kind: "battle-start", timestamp: 0, participants: this.participants, timeLimitMs: this.setup.timeLimitMs });
      this.started = true;
      this.collapseLines();
      return this.events.slice(startIdx);
    }

    const next = findNextUnit(this.states);
    if (!next || this.clock + next.chargeTimer >= this.setup.timeLimitMs) {
      this.clock = this.setup.timeLimitMs;
      this.finishAs("timeout");
      return this.events.slice(startIdx);
    }

    this.advanceClock(next.chargeTimer);
    this.resolveTurn(next);
    const result = this.checkTermination();
    if (result) this.finishAs(result);

    return this.events.slice(startIdx);
  }

  /** The battle's outcome. Call after `isComplete()` returns true. */
  getOutcome(): BattleOutcome {
    if (!this.completed || this.finalResult === null) {
      throw new Error("CombatEngine.getOutcome() called before the battle completed");
    }
    return {
      result: this.finalResult,
      endedAtMs: this.clock,
      units: this.states.map((s) => ({ unitId: s.unitId, health: s.health, alive: s.alive })),
      gathered: { ...this.gathered },
      timeline: {
        schemaVersion: BATTLE_TIMELINE_SCHEMA_VERSION,
        seed: this.setup.seed,
        timeLimitMs: this.setup.timeLimitMs,
        participants: this.participants,
        overrideLog: [...this.overrideLog],
        events: [...this.events],
      },
    };
  }

  // ── Player override input ────────────────────────────────────────

  /**
   * Queue an override for a party unit's next turn, replacing any pending
   * one. Submitted between steps, at any simulated time; consumed at the
   * unit's next turn start. A force-action whose ability is not in the unit's
   * list, or not usable then, is dropped silently and the list drives.
   */
  submitOverride(unitId: string, override: PlayerOverride): void {
    if (this.byId.get(unitId)?.side !== "party") {
      throw new Error(`Overrides are for party units; ${unitId} is not one`);
    }
    this.pendingOverrides.set(unitId, override);
  }

  /** Discard the pending override, if any, for the unit. */
  cancelOverride(unitId: string): void {
    this.pendingOverrides.delete(unitId);
  }

  /** The pending override for a unit, if any. */
  getPendingOverride(unitId: string): PlayerOverride | undefined {
    return this.pendingOverrides.get(unitId);
  }

  // ── Internal lifecycle helpers ───────────────────────────────────

  private finishAs(result: BattleResult): void {
    this.events.push({ kind: "battle-end", timestamp: this.clock, result });
    this.completed = true;
    this.finalResult = result;
  }

  private advanceClock(delta: number): void {
    this.clock += delta;
    for (const s of this.states) {
      if (s.alive && s.acts) s.chargeTimer -= delta;
    }
  }

  private context(actor: UnitState): ActionContext {
    return {
      actor,
      allies: this.states.filter((s) => s.side === actor.side),
      opponents: this.states.filter((s) => s.side !== actor.side),
      clock: this.clock,
    };
  }

  private resolveTurn(state: UnitState): void {
    // A declared action at the end of its warmup resolves; the timer resets.
    if (state.currentAction !== null) {
      const action = state.currentAction;
      state.currentAction = null;
      this.resolveAction(state, action);
      state.chargeTimer = chargeMs(state.stats.speed);
      return;
    }

    this.events.push({ kind: "turn-start", timestamp: this.clock, unitId: state.unitId });
    const context = this.context(state);

    // A pending override is consumed before the list is consulted. If its
    // ability is usable it fires; otherwise it is dropped and the list drives.
    const pending = this.pendingOverrides.get(state.unitId);
    if (pending !== undefined) {
      this.pendingOverrides.delete(state.unitId);
      const forced = state.actions.find((a) => a.abilityId === pending.abilityId);
      const selection = forced ? selectForced(forced, context, this.rng) : undefined;
      if (selection) {
        this.overrideLog.push({ acceptedAtSimTime: this.clock, unitId: state.unitId, override: pending });
        this.events.push({ kind: "action-overridden", timestamp: this.clock, unitId: state.unitId, abilityId: selection.ability.abilityId });
        this.declareAction(state, selection);
        return;
      }
    }

    const selection = selectAction(state.actions, context, this.rng);
    if (!selection) {
      state.chargeTimer = chargeMs(state.stats.speed);
      return;
    }
    this.declareAction(state, selection);
  }

  /** Emit `action-declared`, then either start the warmup or resolve at once. */
  private declareAction(state: UnitState, { ability, target }: ActionSelection): void {
    const action: DeclaredAction = {
      abilityId: ability.abilityId,
      targetIds: [target.unitId],
      resolvesAt: this.clock + ability.warmupMs,
    };
    this.events.push({
      kind: "action-declared",
      timestamp: this.clock,
      unitId: state.unitId,
      abilityId: ability.abilityId,
      targetIds: action.targetIds,
      resolveTimestamp: action.resolvesAt,
    });

    if (ability.warmupMs > 0) {
      state.currentAction = action;
      state.chargeTimer = ability.warmupMs;
    } else {
      this.resolveAction(state, action);
      state.chargeTimer = chargeMs(state.stats.speed);
    }
  }

  private resolveAction(state: UnitState, action: DeclaredAction): void {
    const ability = this.content.abilities[action.abilityId];
    if (!ability) return;
    const effects: ResolvedEffect[] = [];

    for (const targetId of action.targetIds) {
      const target = this.byId.get(targetId);
      if (!target) continue;
      const effect = ability.effect;
      switch (effect.kind) {
        case "damage":
          if (!target.alive) break;
          if (target.kind === "resource") {
            const { workPercent, yieldPercent } = this.content.resourceHit;
            effects.push(this.harvest(target, Math.max(1, Math.floor((state.stats.damage * workPercent) / 100)), yieldPercent));
          } else {
            const guardian = this.guardianOf(target);
            const hit = guardian ?? target;
            hit.health = Math.max(0, hit.health - state.stats.damage);
            effects.push({
              kind: "damage",
              targetId: hit.unitId,
              amount: state.stats.damage,
              newHealth: hit.health,
              ...(guardian ? { guarding: target.unitId } : {}),
            });
          }
          break;
        case "gather":
          if (target.alive && target.material === effect.material) {
            effects.push(this.harvest(target, Math.max(1, state.stats.gathering), 100));
          }
          break;
        case "guard":
          if (target.alive) {
            state.guard = { allyId: target.unitId, until: this.clock + effect.durationMs };
            effects.push({ kind: "guard", targetId: target.unitId, until: state.guard.until });
          }
          break;
        case "move-up": {
          const to = lineAhead(state.line);
          if (to) {
            effects.push({ kind: "move", unitId: state.unitId, from: state.line, to });
            state.line = to;
          }
          break;
        }
      }
    }

    this.events.push({
      kind: "action-resolved",
      timestamp: this.clock,
      unitId: state.unitId,
      abilityId: action.abilityId,
      targetIds: action.targetIds,
      effects,
    });

    this.checkDowns();
    this.collapseLines();
  }

  /** Work done to a resource node, capped at what it holds; the yield is a share of the work. */
  private harvest(node: UnitState, work: number, yieldPercent: number): ResolvedEffect {
    const { material } = node;
    if (material === undefined) throw new Error(`${node.unitId} is not a resource node`);
    const amount = Math.min(work, node.health);
    const gained = Math.floor((amount * yieldPercent) / 100);
    node.health -= amount;
    this.gathered[material] = (this.gathered[material] ?? 0) + gained;
    return { kind: "harvest", targetId: node.unitId, material, amount, yield: gained, newHealth: node.health };
  }

  /** The living unit holding an unexpired guard over this one, the first by id if several do. */
  private guardianOf(unit: UnitState): UnitState | undefined {
    let best: UnitState | undefined;
    for (const s of this.states) {
      if (!s.alive || s === unit || s.side !== unit.side) continue;
      if (s.guard?.allyId !== unit.unitId || s.guard.until <= this.clock) continue;
      if (!best || s.unitId < best.unitId) best = s;
    }
    return best;
  }

  private checkDowns(): void {
    for (const s of this.states) {
      if (s.alive && s.health <= 0) {
        s.alive = false;
        this.events.push({ kind: "unit-down", timestamp: this.clock, unitId: s.unitId });
      }
    }
  }

  /** While a side has living units and none on its front line, all of them move up one line, as one event. */
  private collapseLines(): void {
    for (const side of ["party", "opponents"] as const satisfies readonly Side[]) {
      const living = this.states.filter((s) => s.side === side && s.alive);
      while (living.length > 0 && !living.some((s) => s.line === "front")) {
        const moves = living.map((s) => {
          const from = s.line;
          // Nobody is on the front line, so every living unit has a line ahead.
          s.line = lineAhead(from) ?? from;
          return { unitId: s.unitId, from, to: s.line };
        });
        this.events.push({ kind: "line-collapsed", timestamp: this.clock, side, moves });
      }
    }
  }

  private checkTermination(): BattleResult | null {
    if (!this.states.some((s) => s.side === "party" && s.alive)) return "loss";
    if (!this.states.some((s) => s.side === "opponents" && s.alive)) return "win";
    return null;
  }
}

/**
 * Headless entry point: drives a battle to completion with no overrides. For
 * tests and any caller that wants the outcome without playback.
 *
 * Interactive play constructs `CombatEngine` directly and calls `step()`
 * paced by wall-clock time, with `submitOverride()` between steps.
 */
export function resolveBattle(setup: BattleSetup, content: BattleContent = BATTLE_CONTENT): BattleOutcome {
  const engine = new CombatEngine(setup, content);
  while (!engine.isComplete()) engine.step();
  return engine.getOutcome();
}
