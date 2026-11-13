import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, InjectionToken, signal, viewChild } from '@angular/core';

import { must } from '@heat/engine';

import { LAYOUT_SIZES } from '../camp/layout-sizes';
import { isSideBySide } from '../camp/page-layout';
import { stackedBattleHeight } from './battle/battle-layout';
import type { BattleSceneCallbacks, BattleSceneHandle } from './battle/battle-scene';
import { Play } from './play';

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

/** How a battle page gets its scene; a test provides one that draws nothing, since jsdom has no WebGL. */
export const BATTLE_SCENE_FACTORY = new InjectionToken<BattleSceneFactory>('heat.adventure.scene', {
  providedIn: 'root',
  // Loaded on first use, so PixiJS is a chunk of its own, as the camp's scene is.
  factory: () => async (host, callbacks) => (await import('./battle/battle-scene')).createBattleScene(host, callbacks),
});

/**
 * The regions of a battle page, the open adventure's and a replay's
 * (game.md, "The page"): the battle in the stage, and the content area
 * beside it, below it on a narrow screen, holding what the page projects
 * into it, its heading `panel-title`. It loads the scene and drives it from
 * the frame loop with the `Play` its page provides: each frame the run moves
 * on, and the scene animates what happened and moves on by the same time.
 * Without a scene, as where WebGL is missing, the run plays with the
 * controls alone. The page starts a run once `ready` is set, and hands the
 * scene the run's start with `reset`.
 */
@Component({
  selector: 'heat-battle-view',
  templateUrl: './battle-view.html',
  styleUrl: './battle-view.css',
  host: {
    '(window:resize)': 'measure()',
  },
})
export class BattleView {
  private readonly play = inject(Play);
  private readonly createScene = inject(BATTLE_SCENE_FACTORY);
  private readonly readSizes = inject(LAYOUT_SIZES);

  /** Set once the scene has loaded, or failed to, and a run may start. */
  readonly ready = signal(false);

  /** The window and the regions' sizes, measured together, since a font-size change moves both. */
  private readonly viewport = signal(this.measured());
  protected readonly side = computed(() => isSideBySide(this.viewport().width, this.viewport().height, this.viewport().sizes));
  /** Stacked, the stage's box is the page's width by the stage's height at the scale that fits; side by side the grid sizes it. */
  protected readonly stageHeight = computed(() =>
    this.side() ? null : stackedBattleHeight(this.viewport().width, this.viewport().height, this.viewport().ratio),
  );
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private scene: BattleSceneHandle | null = null;

  constructor() {
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

  /** Hands the scene the field of the run just begun, with each hero's sprite set, by hero id. */
  reset(spriteSets: ReadonlyMap<string, string>): void {
    this.scene?.reset(must(this.play.field(), 'the field'), spriteSets, this.play.entering());
  }

  protected measure(): void {
    this.viewport.set(this.measured());
  }

  private measured() {
    return { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio, sizes: this.readSizes() };
  }

  private async mount(): Promise<void> {
    try {
      this.scene = await this.createScene(this.box().nativeElement, { onEntered: () => { this.play.entered(); } });
      this.play.holdEntries = true;
    } catch {
      this.scene = null;
    }
    this.ready.set(true);
  }

  private frame(ms: number): void {
    const events = this.play.tick(ms);
    const field = this.play.field();
    if (!this.scene || !field) return;
    if (events.length > 0) this.scene.feed(events, field);
    this.scene.frame(this.play.paused() ? 0 : ms * this.play.speed(), this.play.simTime(), field);
  }
}
