import { Injectable, inject, signal } from '@angular/core';
import type { AdventureEvent, AdventureSnapshot, PartyOrder } from '@heat/engine';
import { Game, type AdventureView } from '../game';
import { applyEvent, emptyField, type Field } from './field';
import { AdventureRun, forgetRun, loadRun, saveRun } from './run';

/** The speeds the player can pick (decision 0002): simulated milliseconds per wall-clock millisecond. */
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** How often, in simulated time, the time reached is saved when nothing else changed. */
const SAVE_EVERY_MS = 1000;

/**
 * Playing the open adventure (Issue-15): the run stepped by wall-clock time
 * at the chosen speed, paused or not; the player's overrides and orders; the
 * log saved as it grows, so a closed browser resumes where it was; and the
 * submit when the run ends. The page drives it with `tick` from its frame
 * loop, so a test can drive it by hand.
 */
@Injectable()
export class Play {
  private readonly game = inject(Game);
  private adventure: AdventureView | null = null;
  private run: AdventureRun | null = null;
  private savedAt = 0;
  private savedEntries = 0;

  readonly field = signal<Field | null>(null);
  readonly simTime = signal(0);
  readonly paused = signal(false);
  readonly speed = signal<Speed>(1);
  /** Forced actions waiting for their hero's next turn, by hero. */
  readonly queued = signal<ReadonlyMap<string, string>>(new Map());
  /** Whether the run was picked up from a saved log rather than started afresh. */
  readonly resumed = signal(false);
  /** `submitting` while the hub replays the log; `failed` with the reason when it could not be reached. */
  readonly submit = signal<{ readonly state: 'idle' | 'submitting' | 'failed'; readonly reason?: string }>({ state: 'idle' });

  /** Starts the adventure's run, from its saved log if there is one; does nothing for the run already started. */
  start(adventure: AdventureView): void {
    if (this.adventure?.id === adventure.id) return;
    this.adventure = adventure;
    const saved = loadRun(adventure.id);
    // The hub's snapshot is the engine's field for field, its unit types the content's (schema.graphql, Snapshot).
    const snapshot = adventure.snapshot as AdventureSnapshot;
    const run = new AdventureRun(snapshot, adventure.seed, saved ?? undefined);
    this.run = run;
    this.resumed.set(saved !== null);
    this.savedAt = run.simTime;
    this.savedEntries = run.log.length;
    this.field.set(run.events.reduce(applyEvent, emptyField(adventure.snapshot.heroes)));
    this.simTime.set(run.simTime);
    if (run.complete) void this.finish();
  }

  /** Moves the run on by `wallMs` of wall-clock time at the chosen speed. */
  tick(wallMs: number): void {
    const run = this.run;
    if (!run || run.complete || this.paused()) return;
    const events = run.advanceTo(run.simTime + Math.round(wallMs * this.speed()));
    if (events.length > 0) {
      this.field.update((field) => events.reduce(applyEvent, field!));
      this.settleQueue(events);
    }
    this.simTime.set(run.simTime);
    this.save(false);
    if (run.complete) void this.finish();
  }

  togglePause(): void {
    this.paused.update((p) => !p);
  }

  setSpeed(speed: Speed): void {
    this.speed.set(speed);
  }

  /** Forces a hero's next action; it waits for the hero's turn and is dropped if not usable then. */
  force(heroId: string, abilityId: string): void {
    if (!this.run || this.run.complete) return;
    this.run.force(heroId, abilityId);
    this.queued.update((q) => new Map(q).set(heroId, abilityId));
  }

  /** Press on or retreat; retreat stays selected until press on is given. */
  order(order: PartyOrder): void {
    if (!this.run || this.run.complete) return;
    this.run.orderParty(order);
    this.field.update((field) => (field ? { ...field, order } : field));
  }

  /** Submits again after the hub could not be reached. */
  retry(): void {
    if (this.run?.complete && this.submit().state === 'failed') void this.finish();
  }

  /** A forced action is used or dropped at its hero's next turn, and any still waiting go with the battle. */
  private settleQueue(events: readonly AdventureEvent[]): void {
    if (this.queued().size === 0) return;
    const queued = new Map(this.queued());
    for (const event of events) {
      if (event.kind === 'battle-end') queued.clear();
      else if (event.kind === 'turn-start') queued.delete(event.unitId);
    }
    if (queued.size !== this.queued().size) this.queued.set(queued);
  }

  private save(force: boolean): void {
    const run = this.run;
    const adventure = this.adventure;
    if (!run || !adventure) return;
    if (!force && run.log.length === this.savedEntries && run.simTime - this.savedAt < SAVE_EVERY_MS && !run.complete) return;
    saveRun(adventure.id, { log: run.log, simTime: run.simTime });
    this.savedAt = run.simTime;
    this.savedEntries = run.log.length;
  }

  private async finish(): Promise<void> {
    const run = this.run;
    const adventure = this.adventure;
    if (!run || !adventure || this.submit().state === 'submitting') return;
    this.save(true);
    this.submit.set({ state: 'submitting' });
    try {
      await this.game.submitAdventure(adventure, run.log);
      forgetRun(adventure.id);
      this.submit.set({ state: 'idle' });
    } catch (e) {
      this.submit.set({ state: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
  }
}
