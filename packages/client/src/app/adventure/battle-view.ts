import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, InjectionToken, signal, viewChild } from '@angular/core';

import { must } from '@heat/engine';

import { LAYOUT_SIZES } from '../camp/layout-sizes';
import { isSideBySide } from '../camp/page-layout';
import { stackedBattleHeight } from './battle/battle-layout';
import type { BattleSceneCallbacks, BattleSceneHandle } from './battle/battle-scene';
import type { CastMember } from './cast';
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
 * on, and the scene animates what happened and moves on by the same time;
 * what the scene answers for the clips it began is how long the run then
 * waits (Issue-335), while the scene plays on. Without a scene, as where WebGL is missing, the run plays with the
 * controls alone. The page starts a run once `ready` is set, and hands
 * over the run's start with `reset`, with who the run may set against the
 * party: the scene loads the art of that whole cast first, and until it has,
 * the run does not move and the scene is not shown it (Issue-205).
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

  private readonly mounted = signal(false);
  /** Set once the scene has loaded, or failed to, and a run may start. */
  readonly ready = this.mounted.asReadonly();

  /** The window and the regions' sizes, measured together, since a font-size change moves both. */
  private readonly viewport = signal(this.measured());
  protected readonly side = computed(() => isSideBySide(this.viewport().width, this.viewport().height, this.viewport().sizes));
  /** Stacked, the stage's box is the page's width by the stage's height at the scale that fits; side by side the grid sizes it. */
  protected readonly stageHeight = computed(() =>
    this.side() ? null : stackedBattleHeight(this.viewport().width, this.viewport().height, this.viewport().ratio),
  );
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private scene: BattleSceneHandle | null = null;
  /** The run handed over last, counted, so that an earlier run's art arriving late begins nothing. */
  private handedOver = 0;
  /** The last run whose art the scene has. While it is not the one handed over last, no frame moves the run or the scene. */
  private prepared = 0;

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
      // Art still on its way for a run handed over begins nothing in a scene that is gone.
      this.handedOver++;
      this.scene?.destroy();
    });
  }

  /**
   * Hands the scene the run just begun: each hero's sprite set, by hero id,
   * and `others`, everyone the run may set against the party. The scene
   * shows the run's field once it has the art of all of them.
   */
  reset(spriteSets: ReadonlyMap<string, string>, others: readonly CastMember[]): void {
    const scene = this.scene;
    if (!scene) return;
    const party = must(this.play.field(), 'the field').party.map((hero): CastMember => ({ kind: hero.kind, type: hero.type, spriteSet: spriteSets.get(hero.unitId) }));
    const run = ++this.handedOver;
    void scene.prepare([...party, ...others]).then(() => {
      if (run !== this.handedOver || scene !== this.scene) return;
      this.prepared = run;
      // A page that stopped the run while its art was on its way has no field to show.
      const field = this.play.field();
      if (field) scene.reset(field, spriteSets, this.play.entering());
    });
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
    this.mounted.set(true);
  }

  private frame(ms: number): void {
    if (this.prepared !== this.handedOver) return;
    const events = this.play.tick(ms);
    const field = this.play.field();
    if (!this.scene || !field) return;
    // The scene knows how long the clips these events began last, and the play waits for its share of them.
    if (events.length > 0) this.play.hold(this.scene.feed(events, field));
    this.scene.frame(this.play.paused() ? 0 : ms * this.play.speed(), this.play.simTime(), field);
  }
}
