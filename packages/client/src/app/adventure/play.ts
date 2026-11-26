import { inject, Injectable, signal } from '@angular/core';

import { type AdventureEvent, type AdventureSnapshot, type AdventureTimeline, must, type PartyOrder } from '@heat/engine';

import { type AdventureView, Game } from '../game';
import { spendHold } from './battle/clip-hold';
import { applyEvent, emptyField, type Field, isEntry, jobCart, timelineCart } from './field';
import { AdventureRun, forgetRun, loadRun, type Run, saveRun, TimelineRun } from './run';

/** The speeds the player can pick (decision 0002): simulated milliseconds per wall-clock millisecond. */
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** How often, in simulated time, the time reached is saved when nothing else changed. */
const SAVE_EVERY_MS = 1000;

/**
 * Playing the open adventure (Issue-15): the run stepped by wall-clock time
 * at the chosen speed, paused or not; the player's overrides and orders; the
 * log saved as it grows, so a closed browser resumes where it was; and the
 * submit when the run ends. A replay is played the same way from a stored
 * timeline, with no engine, no overrides and nothing saved. The page drives
 * it with `tick` from its frame loop, so a test can drive it by hand.
 *
 * At an entry, the party setting out or a fight or gather beginning, the
 * clock waits while the scene brings everyone on, when `holdEntries` is set
 * by a page that has a scene, until `entered` is called (the owner's call on
 * Issue-15: the rush in is flavor, and the fight's clock starts after it).
 *
 * When an action resolves the clock waits again, for as long as the scene
 * asks with `hold`: while the action is animated, so that one is seen from
 * its first frame to its last before the next (Issue-335, decision 0057).
 * That wait runs down in presentation
 * time, the wall clock times the speed, and not at all while paused. Both
 * waits are the page's: the engine's clock, its events and the log know
 * nothing of them, so a run and its replay wait alike and verify as before.
 * The run's last action is waited for too: the log is submitted, and the
 * result shown, once that wait is over.
 */
@Injectable()
export class Play {
  private readonly game = inject(Game);
  private adventure: AdventureView | null = null;
  private run: Run | null = null;
  private live: AdventureRun | null = null;
  private savedAt = 0;
  private savedEntries = 0;
  /** What is left of the wait for the clips the last events began, in presentation milliseconds. */
  private held = 0;
  /** The run is over and not yet submitted: it waits for its last action to be shown. */
  private ending = false;

  /** Whether an entry holds the clock until the scene says everyone is on. */
  holdEntries = false;

  readonly field = signal<Field | null>(null);
  readonly simTime = signal(0);
  readonly paused = signal(false);
  readonly speed = signal<Speed>(1);
  /** True while the clock waits at an entry for the scene. */
  readonly entering = signal(false);
  /** True while a stored timeline is played rather than the engine. */
  readonly replaying = signal(false);
  /** Forced actions waiting for their hero's next turn, by hero. */
  readonly queued = signal<ReadonlyMap<string, string>>(new Map());
  /** Whether the run was picked up from a saved log rather than started afresh. */
  readonly resumed = signal(false);
  /** `submitting` while the hub replays the log; `failed` with the reason when it could not be reached. */
  readonly submit = signal<{ readonly state: 'idle' | 'submitting' | 'failed'; readonly reason?: string }>({ state: 'idle' });

  /** Starts the adventure's run, from its saved log if there is one; does nothing for the run already started. */
  start(adventure: AdventureView): void {
    if (this.adventure?.id === adventure.id && this.live) return;
    this.adventure = adventure;
    const saved = loadRun(adventure.id);
    // The hub's snapshot is the engine's field for field, its unit types the content's (schema.graphql, Snapshot).
    const run = new AdventureRun(adventure.snapshot as AdventureSnapshot, adventure.seed, saved ?? undefined);
    this.live = run;
    this.resumed.set(saved !== null);
    this.savedAt = run.simTime;
    this.savedEntries = run.log.length;
    this.begin(run, emptyField(adventure.snapshot.heroes, jobCart(adventure.snapshot.jobId)), false);
    if (run.complete) void this.finish();
  }

  /** Plays a stored timeline from its start, as the replay of an adventure already settled. */
  replay(timeline: AdventureTimeline): void {
    this.live = null;
    this.paused.set(false);
    this.resumed.set(false);
    this.begin(new TimelineRun(timeline), emptyField(timeline.party, timelineCart(timeline.events)), true);
  }

  /** Stops what was playing, the run and its field gone, until the next start or replay; a page that leaves a replay for another does. */
  stop(): void {
    this.run = null;
    this.live = null;
    this.replaying.set(false);
    this.field.set(null);
  }

  /** Leaves the replay; the result shows again. */
  endReplay(): void {
    this.replaying.set(false);
  }

  /** Moves the run on by `wallMs` of wall-clock time at the chosen speed, and answers the events that happened. */
  tick(wallMs: number): readonly AdventureEvent[] {
    const run = this.run;
    if (!run || this.paused() || this.entering() || (run.complete && !this.ending)) return [];
    const { held, left } = spendHold(this.held, wallMs * this.speed());
    this.held = held;
    if (held > 0) return [];
    if (this.ending) {
      this.ending = false;
      void this.finish();
      return [];
    }
    const events = run.advanceTo(run.simTime + Math.round(left));
    if (events.length > 0) {
      this.field.update((field) => events.reduce(applyEvent, must(field, 'the field while events play')));
      this.settleQueue(events);
      if (this.holdEntries && events.some(isEntry)) this.entering.set(true);
    }
    this.simTime.set(run.simTime);
    if (this.live) {
      this.save(false);
      // Over: the frames that follow wait for what the scene asks for its last action, then submit.
      if (this.live.complete) this.ending = true;
    }
    return events;
  }

  /** The scene has brought everyone on: the clock runs again. */
  entered(): void {
    this.entering.set(false);
  }

  /**
   * Holds the clock for `ms` of presentation time, while the clips the events just answered play. The longer of this
   * and a wait still running; nothing at an entry, whose own wait takes its place, the scene clearing the stage as it does.
   */
  hold(ms: number): void {
    if (!this.entering()) this.held = Math.max(this.held, ms);
  }

  togglePause(): void {
    this.paused.update((p) => !p);
  }

  setSpeed(speed: Speed): void {
    this.speed.set(speed);
  }

  /** Forces a hero's next action; it waits for the hero's turn and is dropped if not usable then. */
  force(heroId: string, abilityId: string): void {
    if (!this.live || this.live.complete) return;
    this.live.force(heroId, abilityId);
    this.queued.update((q) => new Map(q).set(heroId, abilityId));
  }

  /** Press on or retreat; retreat stays selected until press on is given. */
  order(order: PartyOrder): void {
    if (!this.live || this.live.complete) return;
    this.live.orderParty(order);
    this.field.update((field) => (field ? { ...field, order } : field));
  }

  /** Submits again after the hub could not be reached. */
  retry(): void {
    if (this.live?.complete && this.submit().state === 'failed') void this.finish();
  }

  /** The field so far; held at the start of a fresh run or a replay, which the scene brings on. */
  private begin(run: Run, start: Field, replaying: boolean): void {
    this.run = run;
    this.replaying.set(replaying);
    this.queued.set(new Map());
    this.held = 0;
    this.ending = false;
    this.field.set(run.events.reduce(applyEvent, start));
    this.simTime.set(run.simTime);
    this.entering.set(this.holdEntries && run.events.some(isEntry) && !this.resumed());
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
    const run = this.live;
    const adventure = this.adventure;
    if (!run || !adventure) return;
    if (!force && run.log.length === this.savedEntries && run.simTime - this.savedAt < SAVE_EVERY_MS && !run.complete) return;
    saveRun(adventure.id, { log: run.log, simTime: run.simTime });
    this.savedAt = run.simTime;
    this.savedEntries = run.log.length;
  }

  private async finish(): Promise<void> {
    const run = this.live;
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
