/**
 * The adventure engine: a job's stages on one timeline, stepped by its
 * caller.
 *
 * New in HEAT (architecture overview, "Engine provenance"): the outer loop
 * of stages, carry-over, cargo, retreat and the stage time limits. Each fight
 * and gather stage runs Issue-110's `CombatEngine`, seeded `<seed>#<stage>`,
 * and its events are shifted onto the adventure's clock. The stepping API is
 * the battle's: a live client steps whatever is due by wall-clock time, and
 * `replay` steps event by event; both get the same timeline.
 *
 * A retreat is selected by a party order and stays selected. During a fight
 * it is attempted every so often, each attempt rolled with its own seeded
 * random number generator, `<seed>#retreat`, so the battle's own draws do not
 * depend on it; when a stage completes with it selected, the party retreats
 * for certain. Reaching a stage's time limit ends the adventure as a retreat.
 * The job's penalty says what a retreat keeps.
 */

import { range } from "es-toolkit";
import { ADVENTURE_CONTENT } from "../content.js";
import { MATERIALS, type Material, type Reward } from "../index.js";
import { CombatEngine, SeededRng, type BattleEvent, type Opponent, type PlayerOverride } from "../battle/index.js";
import type { AdventureContent, Job, Stage } from "./job.js";
import {
  ADVENTURE_TIMELINE_SCHEMA_VERSION,
  type AdventureEvent,
  type AdventureOutcome,
  type AdventureResult,
  type AdventureTimeline,
  type StageEnding,
  type StageResult,
} from "./events.js";
import type { AdventureLogEntry, PartyOrder } from "./override.js";
import { MAX_PARTY, type AdventureSnapshot } from "./snapshot.js";

/** A battle's event on the adventure's clock: every time in it moved by `offset`. */
export function shiftEvent(event: BattleEvent, offset: number): BattleEvent {
  const timestamp = event.timestamp + offset;
  switch (event.kind) {
    case "action-declared":
      return { ...event, timestamp, resolveTimestamp: event.resolveTimestamp + offset };
    case "action-resolved":
      return {
        ...event,
        timestamp,
        effects: event.effects.map((e) => (e.kind === "guard" ? { ...e, until: e.until + offset } : e)),
      };
    default:
      return { ...event, timestamp };
  }
}

function toRewards(amounts: Partial<Record<Material, number>>): Reward[] {
  return MATERIALS.flatMap((material) => {
    const amount = amounts[material] ?? 0;
    return amount > 0 ? [{ material, amount }] : [];
  });
}

function addTo(amounts: Partial<Record<Material, number>>, rewards: readonly Reward[]): void {
  for (const { material, amount } of rewards) amounts[material] = (amounts[material] ?? 0) + amount;
}

/** The battle a fight or gather stage runs: its opponents, ids unique on the whole timeline. */
function opponentsOf(stage: Stage, index: number): Opponent[] {
  const groups = stage.kind === "fight" ? stage.monsters : stage.kind === "gather" ? stage.nodes : [];
  return groups.flatMap(({ type, count }) => range(count).map((n) => ({ unitId: `s${String(index)}-${type}-${String(n + 1)}`, type })));
}

/**
 * The adventure engine. Construct it with the snapshot the hub issued and the
 * seed, then call `step()` until `isComplete()`, with `submitOverride()` and
 * `submitOrder()` between steps.
 */
export class AdventureEngine {
  private readonly job: Job;
  private readonly retreatRng: SeededRng;
  private readonly events: AdventureEvent[] = [];
  private readonly overrideLog: AdventureLogEntry[] = [];
  private readonly health = new Map<string, number>();
  private readonly cargo: Partial<Record<Material, number>> = {};
  private readonly stageResults: StageResult[] = [];
  private clock = 0;

  private started = false;
  private outcome: AdventureOutcome | null = null;

  private stageIndex = -1;
  private stageStart = 0;
  private battle: CombatEngine | null = null;
  private battleHeroes: ReadonlySet<string> = new Set();

  private retreatSelected = false;
  private pendingOrder: PartyOrder | null = null;
  private nextAttemptAt: number | null = null;
  private failedAttempts = 0;

  constructor(
    private readonly snapshot: AdventureSnapshot,
    private readonly seed: string,
    private readonly content: AdventureContent = ADVENTURE_CONTENT,
  ) {
    const job = Object.hasOwn(content.jobs, snapshot.jobId) ? content.jobs[snapshot.jobId] : undefined;
    if (!job) throw new Error(`Unknown job ${snapshot.jobId}`);
    if (job.stages.at(-1)?.kind !== "arrive") throw new Error(`Job ${job.id} does not end with arrive`);
    const { heroes } = snapshot;
    if (heroes.length < 1 || heroes.length > MAX_PARTY) {
      throw new Error(`A party is 1 to ${String(MAX_PARTY)} heroes, not ${String(heroes.length)}`);
    }
    for (const hero of heroes) {
      if (!content.battle.heroes[hero.unitType]) throw new Error(`Unit type ${hero.unitType} has no combat profile`);
      if (this.health.has(hero.heroId)) throw new Error(`Hero ${hero.heroId} is in the party twice`);
      this.health.set(hero.heroId, hero.stats.maxHealth);
    }
    this.job = job;
    this.retreatRng = new SeededRng(`${seed}#retreat`);
  }

  // ── Public stepping API ──────────────────────────────────────────

  /** True once `adventure-end` has been emitted. */
  isComplete(): boolean {
    return this.outcome !== null;
  }

  /** Current simulation clock in milliseconds. 0 before the first step. */
  getCurrentSimTime(): number {
    return this.clock;
  }

  /** The simulated time of the next step's events. 0 before the first step; the clock once complete. */
  getNextEventTime(): number {
    if (!this.started) return 0;
    if (this.outcome !== null) return this.clock;
    const stage = this.currentStage();
    if (stage.kind === "travel") return this.stageStart + stage.lengthMs;
    if (!this.battle) return this.clock;
    const battleNext = this.stageStart + this.battle.getNextEventTime();
    return this.nextAttemptAt !== null && this.nextAttemptAt < battleNext ? this.nextAttemptAt : battleNext;
  }

  /**
   * Advance to the next moment something happens and return the events
   * emitted by this step. A pending party order is taken up first, at this
   * step's time. Once `isComplete()` returns true, further calls return an
   * empty array.
   */
  step(): readonly AdventureEvent[] {
    if (this.outcome !== null) return [];
    const startIdx = this.events.length;

    if (!this.started) {
      this.started = true;
      this.events.push({
        kind: "adventure-start",
        timestamp: 0,
        jobId: this.job.id,
        party: this.snapshot.heroes.map((h) => ({ heroId: h.heroId, health: h.stats.maxHealth, maxHealth: h.stats.maxHealth })),
      });
      this.takeOrder(0);
      this.enterStage(0);
      return this.events.slice(startIdx);
    }

    this.takeOrder(this.getNextEventTime());
    const at = this.getNextEventTime();
    const stage = this.currentStage();

    if (stage.kind === "travel") {
      this.clock = at;
      this.completeStage("done");
    } else if (this.battle) {
      if (this.nextAttemptAt !== null && at === this.nextAttemptAt && at < this.stageStart + this.battle.getNextEventTime()) {
        this.attemptRetreat(this.battle);
      } else {
        this.stepBattle(this.battle);
      }
    }
    return this.events.slice(startIdx);
  }

  /** The timeline. Call after `isComplete()` returns true. */
  getTimeline(): AdventureTimeline {
    if (this.outcome === null) throw new Error("AdventureEngine.getTimeline() called before the adventure completed");
    return {
      schemaVersion: ADVENTURE_TIMELINE_SCHEMA_VERSION,
      version: this.snapshot.version,
      seed: this.seed,
      jobId: this.job.id,
      party: this.snapshot.heroes,
      overrideLog: [...this.overrideLog],
      events: [...this.events],
    };
  }

  /** The result settlement reads. Call after `isComplete()` returns true. */
  getResult(): AdventureResult {
    const outcome = this.outcome;
    if (outcome === null) throw new Error("AdventureEngine.getResult() called before the adventure completed");
    const { pay, xp, retreat } = this.job;
    const keepsPay = outcome === "complete" || (outcome === "retreat" && retreat.keepsPay);
    const keepsCargo = outcome === "complete" || (outcome === "retreat" && retreat.keepsCargo);
    const earned = outcome === "complete" ? xp : outcome === "retreat" ? Math.floor((xp * retreat.xpPercent) / 100) : 0;

    const rewards: Partial<Record<Material, number>> = {};
    if (keepsPay) addTo(rewards, pay);
    if (keepsCargo) addTo(rewards, toRewards(this.cargo));

    const health = this.snapshot.heroes.map((h) => ({ heroId: h.heroId, health: this.health.get(h.heroId) ?? 0 }));
    return {
      outcome,
      endedAtMs: this.clock,
      stages: [...this.stageResults],
      reachedStage: this.stageIndex,
      rewards: toRewards(rewards),
      xp: health.filter((h) => h.health > 0).map((h) => ({ heroId: h.heroId, xp: earned })),
      dead: health.filter((h) => h.health <= 0).map((h) => h.heroId),
      health,
    };
  }

  // ── Player input ─────────────────────────────────────────────────

  /**
   * Queue a forced action for a hero's next turn in the current fight or
   * gather, replacing any pending one (`CombatEngine.submitOverride`). Given
   * outside a battle, or for a hero not in it, it is dropped: it changes
   * nothing and leaves no entry.
   */
  submitOverride(heroId: string, override: PlayerOverride): void {
    if (!this.health.has(heroId)) throw new Error(`Overrides are for the party; ${heroId} is not in it`);
    if (this.battle && !this.battle.isComplete() && this.battleHeroes.has(heroId)) {
      this.battle.submitOverride(heroId, override);
    }
  }

  /** Give a party order, taken up at the next step and replacing any order not yet taken up. */
  submitOrder(order: PartyOrder): void {
    this.pendingOrder = order;
  }

  /** The order in force, or the one waiting for the next step. */
  getOrder(): PartyOrder {
    return this.pendingOrder ?? (this.retreatSelected ? "retreat" : "press-on");
  }

  // ── Internal ─────────────────────────────────────────────────────

  private currentStage(): Stage {
    const stage = this.job.stages[this.stageIndex];
    if (!stage) throw new Error(`No stage ${String(this.stageIndex)}`);
    return stage;
  }

  /** Take up the pending order at `at`; one that changes the selection is logged. */
  private takeOrder(at: number): void {
    const order = this.pendingOrder;
    this.pendingOrder = null;
    if (order === null || (order === "retreat") === this.retreatSelected) return;
    this.retreatSelected = order === "retreat";
    this.overrideLog.push({ kind: "party", acceptedAtSimTime: at, order });
    this.events.push({ kind: "order", timestamp: at, order });
    this.failedAttempts = 0;
    this.nextAttemptAt = this.retreatSelected && this.battle ? at + this.content.retreat.intervalMs : null;
  }

  private enterStage(index: number): void {
    this.stageIndex = index;
    this.stageStart = this.clock;
    this.battle = null;
    const stage = this.currentStage();
    this.events.push({ kind: "stage-start", timestamp: this.clock, stage: index, stageKind: stage.kind });

    if (stage.kind === "arrive") {
      this.endStage("done");
      this.finish("complete");
    } else if (stage.kind === "fight" || stage.kind === "gather") {
      const party = this.snapshot.heroes.flatMap((h) => {
        const health = this.health.get(h.heroId) ?? 0;
        return health > 0 ? [{ unitId: h.heroId, unitType: h.unitType, health, stats: h.stats }] : [];
      });
      this.battleHeroes = new Set(party.map((p) => p.unitId));
      this.battle = new CombatEngine(
        {
          seed: `${this.seed}#${String(index)}`,
          party,
          opponents: opponentsOf(stage, index),
          timeLimitMs: stage.timeLimitMs,
          ...(stage.kind === "gather" ? { carryLimit: stage.carry } : {}),
        },
        this.content.battle,
      );
      this.pushBattleEvents(this.battle.step());
      // Only an order taken up at the very first step can be in force here.
      if (this.retreatSelected) this.nextAttemptAt = this.clock + this.content.retreat.intervalMs;
    }
  }

  private stepBattle(battle: CombatEngine): void {
    this.pushBattleEvents(battle.step());
    this.clock = this.stageStart + battle.getCurrentSimTime();
    if (battle.isComplete()) this.endBattle(battle);
  }

  private attemptRetreat(battle: CombatEngine): void {
    const at = this.nextAttemptAt ?? this.clock;
    const { intervalMs, firstChancePercent, risePercent } = this.content.retreat;
    const chancePercent = Math.min(100, firstChancePercent + risePercent * this.failedAttempts);
    const roll = this.retreatRng.nextInt(1, 100);
    const succeeded = roll <= chancePercent;
    this.clock = at;
    this.events.push({ kind: "retreat-attempt", timestamp: at, chancePercent, roll, succeeded });
    if (succeeded) {
      this.nextAttemptAt = null;
      this.pushBattleEvents(battle.retreat(at - this.stageStart));
      this.endBattle(battle);
    } else {
      this.failedAttempts++;
      this.nextAttemptAt = at + intervalMs;
    }
  }

  /** Shift a battle's events onto the timeline and log the forced actions it used. */
  private pushBattleEvents(events: readonly BattleEvent[]): void {
    for (const event of events) {
      const shifted = shiftEvent(event, this.stageStart);
      this.events.push(shifted);
      if (shifted.kind === "action-overridden") {
        this.overrideLog.push({
          kind: "unit",
          acceptedAtSimTime: shifted.timestamp,
          unitId: shifted.unitId,
          override: { kind: "force-action", abilityId: shifted.abilityId },
        });
      }
    }
  }

  /** Carry the battle's health and cargo over, then end the stage as it ended. */
  private endBattle(battle: CombatEngine): void {
    const outcome = battle.getOutcome();
    for (const unit of outcome.units) {
      if (this.health.has(unit.unitId)) this.health.set(unit.unitId, unit.health);
    }
    addTo(this.cargo, toRewards(outcome.gathered));
    this.nextAttemptAt = null;
    switch (outcome.result) {
      case "win":
        this.completeStage("win");
        break;
      case "loss":
        this.endStage("loss");
        this.finish("defeat");
        break;
      case "timeout":
      case "retreat":
        this.endStage(outcome.result);
        this.finish("retreat");
        break;
    }
  }

  /** A stage completed: the party retreats for certain if retreat is selected, else moves on. */
  private completeStage(ended: StageEnding): void {
    this.endStage(ended);
    if (this.retreatSelected) this.finish("retreat");
    else this.enterStage(this.stageIndex + 1);
  }

  private endStage(ended: StageEnding): void {
    const stage = this.currentStage();
    this.events.push({
      kind: "stage-end",
      timestamp: this.clock,
      stage: this.stageIndex,
      ended,
      health: this.snapshot.heroes.map((h) => ({ heroId: h.heroId, health: this.health.get(h.heroId) ?? 0 })),
      cargo: toRewards(this.cargo),
    });
    this.stageResults.push({ stage: this.stageIndex, kind: stage.kind, ended, startedAtMs: this.stageStart, endedAtMs: this.clock });
  }

  private finish(outcome: AdventureOutcome): void {
    this.battle = null;
    this.outcome = outcome;
    this.events.push({ kind: "adventure-end", timestamp: this.clock, outcome });
  }
}
