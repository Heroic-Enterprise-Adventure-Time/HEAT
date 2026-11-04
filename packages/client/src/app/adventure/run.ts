import { sortBy } from 'es-toolkit';

import {
  AdventureEngine,
  type AdventureEvent,
  type AdventureLogEntry,
  type AdventureSnapshot,
  type AdventureTimeline,
  type PartyOrder,
} from '@heat/engine';

import { isEntry } from './field';

/**
 * What the page plays: a run of the engine, or a stored timeline replayed
 * with no engine. Stepping stops at an entry, the party setting out or a
 * fight or gather beginning, so that the clock can wait there while the
 * scene brings everyone on (the owner's call on Issue-15).
 */
export interface Run {
  readonly simTime: number;
  readonly complete: boolean;
  readonly events: readonly AdventureEvent[];
  advanceTo(simTime: number): readonly AdventureEvent[];
}

/**
 * One adventure being played in the browser: the engine run from the issued
 * snapshot and seed, stepped up to a time its caller chooses, and the
 * override log so far (architecture overview, "The adventure loop").
 *
 * The log is read off the events, `action-overridden` for a forced action
 * and `order` for a party order, which are the entries the engine keeps for
 * itself, so the log submitted is the one the engine would give at the end.
 * A run resumed from a saved log steps event by event up to the saved time,
 * handing each entry in before the step that reaches it, as the engine's
 * `replay` does, and then plays on.
 */
export class AdventureRun implements Run {
  private readonly engine: AdventureEngine;
  private readonly entries: AdventureLogEntry[] = [];
  private readonly all: AdventureEvent[] = [];
  private time = 0;

  constructor(snapshot: AdventureSnapshot, seed: string, saved?: { readonly log: readonly AdventureLogEntry[]; readonly simTime: number }) {
    this.engine = new AdventureEngine(snapshot, seed);
    if (saved) this.resume(saved.log, saved.simTime);
    else this.advanceTo(0);
  }

  /** The time reached: every event at or before it has happened. */
  get simTime(): number {
    return this.time;
  }

  get complete(): boolean {
    return this.engine.isComplete();
  }

  /** Every event so far, in order. */
  get events(): readonly AdventureEvent[] {
    return this.all;
  }

  /** Every override and order the run has used so far, in simulated-time order. */
  get log(): readonly AdventureLogEntry[] {
    return this.entries;
  }

  /** The order in force, or the one waiting for the next step. */
  get order(): PartyOrder {
    return this.engine.getOrder();
  }

  /**
   * Steps every event due by `simTime` and answers them, stopping after a
   * step that holds an entry, with the clock at the entry's time; the clock
   * also stops at the end.
   */
  advanceTo(simTime: number): readonly AdventureEvent[] {
    const from = this.all.length;
    while (!this.engine.isComplete() && this.engine.getNextEventTime() <= simTime) {
      const entry = this.take(this.engine.step()).find(isEntry);
      if (entry) {
        this.time = entry.timestamp;
        return this.all.slice(from);
      }
    }
    this.time = this.engine.isComplete() ? this.engine.getCurrentSimTime() : Math.max(this.time, simTime);
    return this.all.slice(from);
  }

  /** Forces a hero's next action; it applies at the hero's next turn if usable then. */
  force(heroId: string, abilityId: string): void {
    this.engine.submitOverride(heroId, { kind: 'force-action', abilityId });
  }

  /** Gives a party order, taken up at the next step. */
  orderParty(order: PartyOrder): void {
    this.engine.submitOrder(order);
  }

  private resume(saved: readonly AdventureLogEntry[], simTime: number): void {
    const log = sortBy(saved, ['acceptedAtSimTime']);
    let i = 0;
    while (!this.engine.isComplete() && this.engine.getNextEventTime() <= simTime) {
      for (let entry = log[i]; entry && entry.acceptedAtSimTime <= this.engine.getNextEventTime(); entry = log[++i]) {
        if (entry.kind === 'unit') this.engine.submitOverride(entry.unitId, entry.override);
        else this.engine.submitOrder(entry.order);
      }
      this.take(this.engine.step());
    }
    this.time = this.engine.isComplete() ? this.engine.getCurrentSimTime() : simTime;
  }

  private take(events: readonly AdventureEvent[]): readonly AdventureEvent[] {
    for (const event of events) {
      this.all.push(event);
      if (event.kind === 'action-overridden') {
        this.entries.push({
          kind: 'unit',
          acceptedAtSimTime: event.timestamp,
          unitId: event.unitId,
          override: { kind: 'force-action', abilityId: event.abilityId },
        });
      } else if (event.kind === 'order') {
        this.entries.push({ kind: 'party', acceptedAtSimTime: event.timestamp, order: event.order });
      }
    }
    return events;
  }
}

/**
 * A stored timeline played back: the replay, which is display only and
 * never needs the engine (decision 0030). It stops at an entry as a run
 * does, after every event at the entry's time.
 */
export class TimelineRun implements Run {
  private next = 0;
  private time = 0;

  constructor(private readonly timeline: AdventureTimeline) {
    this.advanceTo(0);
  }

  get simTime(): number {
    return this.time;
  }

  get complete(): boolean {
    return this.next >= this.timeline.events.length;
  }

  get events(): readonly AdventureEvent[] {
    return this.timeline.events.slice(0, this.next);
  }

  advanceTo(simTime: number): readonly AdventureEvent[] {
    const { events } = this.timeline;
    const from = this.next;
    for (let event = events[this.next]; event && event.timestamp <= simTime; event = events[this.next]) {
      this.next++;
      if (isEntry(event)) {
        while (events[this.next]?.timestamp === event.timestamp) this.next++;
        this.time = event.timestamp;
        return events.slice(from, this.next);
      }
    }
    this.time = this.complete ? (events.at(-1)?.timestamp ?? 0) : Math.max(this.time, simTime);
    return events.slice(from, this.next);
  }
}

/** Where a run's log is kept between visits: the browser's storage, by adventure id. */
export const SAVED_RUN_PREFIX = 'heat.adventure.';

export interface SavedRun {
  readonly log: readonly AdventureLogEntry[];
  readonly simTime: number;
}

/** The saved log of an adventure, or null when there is none or it cannot be read: the run then starts again with the same seed. */
export function loadRun(adventureId: string): SavedRun | null {
  try {
    const text = localStorage.getItem(SAVED_RUN_PREFIX + adventureId);
    if (!text) return null;
    const value = JSON.parse(text) as SavedRun;
    return Array.isArray(value.log) && typeof value.simTime === 'number' ? value : null;
  } catch {
    return null;
  }
}

export function saveRun(adventureId: string, run: SavedRun): void {
  try {
    localStorage.setItem(SAVED_RUN_PREFIX + adventureId, JSON.stringify(run));
  } catch {
    // Without storage, a closed browser restarts the run from the beginning.
  }
}

export function forgetRun(adventureId: string): void {
  try {
    localStorage.removeItem(SAVED_RUN_PREFIX + adventureId);
  } catch {
    // Nothing to forget.
  }
}
