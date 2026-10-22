import { Component, DestroyRef, InjectionToken, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ABILITIES, JOBS, UNIT_PROFILES, location, type AbilityId, type JobId, type PartyOrder, type UnitType } from '@heat/engine';
import { Game, type AdventureResultView } from '../game';
import { isSideBySide } from '../camp/page-layout';
import { stageWords } from '../camp/panels/job-words';
import { secondsLeft } from './field';
import { Play, SPEEDS } from './play';

/** Calls `onFrame` with the wall-clock milliseconds since the last frame until stopped; a test provides one it drives by hand. */
export type FrameLoop = (onFrame: (elapsedMs: number) => void) => () => void;

/** The longest step one frame may take, so a tab coming back from the background does not leap ahead. */
const MAX_FRAME_MS = 250;

export const FRAME_LOOP = new InjectionToken<FrameLoop>('heat.adventure.frames', {
  providedIn: 'root',
  factory: () => (onFrame) => {
    let last: number | null = null;
    let id = requestAnimationFrame(function frame(now) {
      if (last !== null) onFrame(Math.min(now - last, MAX_FRAME_MS));
      last = now;
      id = requestAnimationFrame(frame);
    });
    return () => cancelAnimationFrame(id);
  },
});

/** How a stage ended, in the player's words. */
const ENDINGS: Readonly<Record<string, string>> = {
  done: 'done',
  win: 'won',
  loss: 'lost',
  timeout: 'time ran out',
  retreat: 'turned back',
};

const OUTCOMES: Readonly<Record<AdventureResultView['outcome'], string>> = {
  complete: 'Job done',
  retreat: 'The party turned back',
  defeat: 'The party fell',
};

/**
 * The open adventure, `/adventure` (Issue-15): the battle in the stage, and
 * in the content area beside it, below it on a narrow screen, the party and
 * the controls (game.md, "The page"): pause and the speeds, each hero's
 * abilities to force its next action, the party's orders, press on and
 * retreat, and in a stage's last ten seconds the time left before the party
 * turns back. When the run ends it is submitted, and the result takes the
 * controls' place, with Back to camp. With no adventure open and no result
 * to show, the address goes to the camp.
 */
@Component({
  selector: 'heat-adventure',
  templateUrl: './adventure.html',
  styleUrl: './adventure.css',
  providers: [Play],
  host: {
    '(window:resize)': 'measure()',
  },
})
export class Adventure {
  protected readonly game = inject(Game);
  protected readonly play = inject(Play);
  private readonly router = inject(Router);
  protected readonly speeds = SPEEDS;
  protected readonly endings = ENDINGS;
  protected readonly outcomes = OUTCOMES;

  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight });
  protected readonly side = computed(() => isSideBySide(this.viewport().width, this.viewport().height));

  protected readonly from = computed(() => {
    const at = (this.game.settled()?.adventure ?? this.game.adventure())?.location ?? '';
    return location(at)?.name ?? at;
  });
  /** The stage under way in words, "Stage 2 of 3: Fight 2 wolves". */
  protected readonly stage = computed(() => {
    const field = this.play.field();
    const jobId = this.game.adventure()?.snapshot.jobId;
    const job = jobId && Object.hasOwn(JOBS, jobId) ? JOBS[jobId as JobId] : undefined;
    const stage = field && job?.stages[field.stage];
    return field && job && stage ? `Stage ${field.stage + 1} of ${job.stages.length}: ${stageWords(stage)}` : null;
  });
  protected readonly countdown = computed(() => {
    const field = this.play.field();
    return field ? secondsLeft(field, this.play.simTime()) : null;
  });
  /** Whether a hero can be told what to do: in a fight or a gather, before the end. */
  protected readonly inBattle = computed(() => {
    const field = this.play.field();
    return !!field && field.outcome === null && field.timeLimitMs !== null;
  });

  constructor() {
    effect(() => {
      const adventure = this.game.adventure();
      if (adventure && !this.game.settled()) untracked(() => this.play.start(adventure));
    });
    effect(() => {
      // Only once the player is loaded: before then, no adventure means not read yet.
      if (this.game.player() && !this.game.adventure() && !this.game.settled()) {
        void this.router.navigate(['/camp', this.game.location()], { replaceUrl: true });
      }
    });
    const frames = inject(FRAME_LOOP);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => destroyRef.onDestroy(frames((ms) => this.play.tick(ms))));
  }

  protected measure(): void {
    this.viewport.set({ width: window.innerWidth, height: window.innerHeight });
  }

  /** A hero's abilities, from its unit type's one action list, as force buttons. */
  protected abilities(unitType: string): readonly { readonly id: string; readonly name: string }[] {
    return (UNIT_PROFILES[unitType as UnitType]?.actions ?? []).map((id) => ({ id, name: this.abilityName(id) }));
  }

  protected abilityName(id: string | undefined): string {
    return id && Object.hasOwn(ABILITIES, id) ? ABILITIES[id as AbilityId].name : (id ?? '');
  }

  protected order(order: PartyOrder): void {
    this.play.order(order);
  }

  protected heroName(heroId: string): string {
    return this.game.settled()?.adventure.snapshot.heroes.find((h) => h.heroId === heroId)?.name ?? heroId;
  }

  /** The level a hero had when it set out, to say whether it gained one. */
  protected startLevel(heroId: string): number {
    return this.game.settled()?.adventure.snapshot.heroes.find((h) => h.heroId === heroId)?.level ?? 1;
  }

  /** Back to the camp the adventure left from, which the player was read again for; a reload waiting for this happens now. */
  protected async backToCamp(): Promise<void> {
    const at = this.game.settled()?.adventure.location ?? this.game.location();
    await this.router.navigate(['/camp', at]);
    this.game.settled.set(null);
  }
}
