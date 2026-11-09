import { NgTemplateOutlet } from '@angular/common';
import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, InjectionToken, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { ABILITIES, type AbilityId, type JobId, JOBS, location, must, type PartyOrder, UNIT_PROFILES, type UnitType } from '@heat/engine';

import { LAYOUT_SIZES } from '../camp/layout-sizes';
import { isSideBySide } from '../camp/page-layout';
import { stageWords } from '../camp/panels/job-words';
import { type AdventureResultView, Game } from '../game';
import { stackedBattleHeight } from './battle/battle-layout';
import type { BattleSceneCallbacks, BattleSceneHandle } from './battle/battle-scene';
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
    return () => { cancelAnimationFrame(id); };
  },
});

export type BattleSceneFactory = (host: HTMLElement, callbacks: BattleSceneCallbacks) => Promise<BattleSceneHandle>;

/** How the page gets its battle scene; a test provides one that draws nothing, since jsdom has no WebGL. */
export const BATTLE_SCENE_FACTORY = new InjectionToken<BattleSceneFactory>('heat.adventure.scene', {
  providedIn: 'root',
  // Loaded on first use, so PixiJS is a chunk of its own, as the camp's scene is.
  factory: () => async (host, callbacks) => (await import('./battle/battle-scene')).createBattleScene(host, callbacks),
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
 * controls' place, with the replay, which plays the stored timeline in the
 * same scene with no engine, and Back to camp. With no adventure open and no
 * result to show, the address goes to the camp. The run waits for the scene
 * to load, so that the party can run on from the start.
 */
@Component({
  selector: 'heat-adventure',
  imports: [NgTemplateOutlet],
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
  private readonly createScene = inject(BATTLE_SCENE_FACTORY);
  private readonly readSizes = inject(LAYOUT_SIZES);
  protected readonly speeds = SPEEDS;
  protected readonly endings = ENDINGS;
  protected readonly outcomes = OUTCOMES;

  /** The window and the regions' sizes, measured together, since a font-size change moves both. */
  private readonly viewport = signal(this.measured());
  protected readonly side = computed(() => isSideBySide(this.viewport().width, this.viewport().height, this.viewport().sizes));
  /** Stacked, the stage's box is the page's width by the stage's height at the scale that fits; side by side the grid sizes it. */
  protected readonly stageHeight = computed(() =>
    this.side() ? null : stackedBattleHeight(this.viewport().width, this.viewport().height, this.viewport().ratio),
  );
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private scene: BattleSceneHandle | null = null;
  /** Set once the scene has loaded, or failed to, and the run may start. */
  private readonly sceneReady = signal(false);
  private startedId: string | null = null;
  /** The replay's timeline is being fetched, or could not be. */
  protected readonly replayState = signal<'idle' | 'loading' | 'failed'>('idle');

  protected readonly from = computed(() => {
    const at = (this.game.settled()?.adventure ?? this.game.adventure())?.location ?? '';
    return location(at)?.name ?? at;
  });
  /** The stage under way in words, "Stage 2 of 3: Fight 2 wolves". */
  protected readonly stageName = computed(() => {
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
  /** Why the ability buttons are disabled, shown beside them (angular.md, rule 14); null while they can be used. */
  protected readonly abilitiesWait = computed(() => {
    const field = this.play.field();
    if (!field || this.inBattle()) return null;
    return field.outcome === null ? 'On the road: abilities are for a fight or a gather.' : 'The adventure is over.';
  });

  constructor() {
    effect(() => {
      const adventure = this.game.adventure();
      if (!adventure || this.game.settled() || !this.sceneReady() || this.startedId === adventure.id) return;
      untracked(() => {
        this.startedId = adventure.id;
        this.play.start(adventure);
        this.scene?.reset(must(this.play.field(), 'the field'), new Map(adventure.snapshot.heroes.map((h) => [h.heroId, h.spriteSet])), this.play.entering());
      });
    });
    effect(() => {
      // Only once the player is loaded: before then, no adventure means not read yet.
      if (this.game.player() && !this.game.adventure() && !this.game.settled()) {
        void this.router.navigate(['/camp', this.game.location()], { replaceUrl: true });
      }
    });
    const frames = inject(FRAME_LOOP);
    const destroyRef = inject(DestroyRef);
    let destroyed = false;
    afterNextRender(() => {
      void this.mount().then(() => {
        if (!destroyed) destroyRef.onDestroy(frames((ms) => { this.frame(ms); }));
      });
    });
    destroyRef.onDestroy(() => {
      destroyed = true;
      this.scene?.destroy();
    });
  }

  protected measure(): void {
    this.viewport.set(this.measured());
  }

  private measured() {
    return { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio, sizes: this.readSizes() };
  }

  /** Loads the scene; without one, as where WebGL is missing, the run plays with the controls alone. */
  private async mount(): Promise<void> {
    try {
      this.scene = await this.createScene(this.box().nativeElement, { onEntered: () => { this.play.entered(); } });
      this.play.holdEntries = true;
    } catch {
      this.scene = null;
    }
    this.sceneReady.set(true);
  }

  /** One frame: the run moves on, and the scene animates what happened and moves on by the same time. */
  private frame(ms: number): void {
    const events = this.play.tick(ms);
    const field = this.play.field();
    if (!this.scene || !field) return;
    if (events.length > 0) this.scene.feed(events, field);
    this.scene.frame(this.play.paused() ? 0 : ms * this.play.speed(), this.play.simTime(), field);
  }

  /** Plays the stored timeline of the adventure just settled, read through the hub, in the same scene. */
  protected async replay(): Promise<void> {
    const settled = this.game.settled();
    if (!settled) return;
    this.replayState.set('loading');
    const timeline = await this.game.timeline(settled.adventure.id).catch(() => null);
    if (!timeline) {
      this.replayState.set('failed');
      return;
    }
    this.replayState.set('idle');
    this.play.replay(timeline);
    this.scene?.reset(must(this.play.field(), 'the field'), new Map(timeline.party.map((h) => [h.heroId, h.spriteSet])), this.play.entering());
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
