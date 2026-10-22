import { Component, DestroyRef, ElementRef, InjectionToken, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { STARTING_LOCATION, type FacilityKind } from '@heat/engine';
import { Game, type HeroView, type SeenHeroView } from '../game';
import { CampState } from './camp-state';
import { iconScale, isSideBySide, menuLabels, stackedStageHeight } from './page-layout';
import { LAYOUTS } from './scene/layout';
import type { CampSceneHandle, SceneCallbacks } from './scene/camp-scene';
import type { CampLayout } from './scene/layout';

export type CampSceneFactory = (
  host: HTMLElement,
  layout: CampLayout,
  levels: Readonly<Partial<Record<FacilityKind, number>>>,
  callbacks: SceneCallbacks,
) => Promise<CampSceneHandle>;

/** How the camp gets its scene; a test provides one that draws nothing, since jsdom has no WebGL. */
export const CAMP_SCENE_FACTORY = new InjectionToken<CampSceneFactory>('heat.camp.scene', {
  providedIn: 'root',
  // Loaded on first use, so PixiJS is a chunk of its own, not in the initial bundle.
  factory: () => async (host, layout, levels, callbacks) => (await import('./scene/camp-scene')).createCampScene(host, layout, levels, callbacks),
});

/**
 * The camp, `/camp/<location>`, in the page's regions (Issue-89): the facility
 * menu, the scene, and the content area beside it, which always shows one
 * panel and never covers the scene. The panel is a child route: the heroes
 * hall by default, `/<facility>` for another, `/heroes-hall/heroes/<id>` for
 * a hero's card, so the address says where the player is, back returns to
 * the last panel, and the menu marks the hall while one of its heroes is open.
 * Other players' heroes seen at the location walk about beside the player's
 * own, and a click on one opens its read-only card, `/seen/<id>`.
 * Every facility the camp has or may build is listed and drawn; one not yet
 * built stands as an unfinished building. While an adventure is open, the
 * menu ends with an entry that leads to it, `/adventure` (Issue-115).
 */
@Component({
  selector: 'heat-camp',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './camp.html',
  styleUrl: './camp.css',
  providers: [CampState],
  host: {
    '(window:resize)': 'measure()',
  },
})
export class Camp {
  protected readonly game = inject(Game);
  protected readonly state = inject(CampState);
  private readonly router = inject(Router);
  private readonly createScene = inject(CAMP_SCENE_FACTORY);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);

  protected readonly location = computed(() => this.params()?.get('location') ?? STARTING_LOCATION);

  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio });
  protected readonly side = computed(() => isSideBySide(this.viewport().width, this.viewport().height));
  protected readonly labels = computed(() => menuLabels(this.viewport().width, this.viewport().height));
  protected readonly iconPx = computed(() => 32 * iconScale(this.viewport().width, this.viewport().height));
  /** Stacked, the scene's box is the page's width by the map's height at the scale that fits; side by side the grid sizes it. */
  protected readonly stageHeight = computed(() =>
    this.side() ? null : stackedStageHeight(this.viewport().width, this.viewport().height, this.viewport().ratio),
  );

  private readonly ratioWatch = new AbortController();
  private scene: CampSceneHandle | null = null;
  private rendered = false;
  /** Counts the scenes asked for, so one that finishes loading after a newer one was asked for is thrown away. */
  private mounts = 0;

  constructor() {
    // The address names the camp and the game follows it; a camp with no layout goes to the starting one.
    effect(() => {
      const location = this.location();
      untracked(() => {
        if (LAYOUTS[location]) this.game.location.set(location);
        else void this.router.navigate(['/camp', STARTING_LOCATION], { replaceUrl: true });
      });
    });
    afterNextRender(() => {
      this.rendered = true;
      void this.mount();
    });
    // Another camp is another scene.
    effect(() => {
      this.state.layout();
      untracked(() => {
        if (this.rendered) void this.mount();
      });
    });
    effect(() => this.showHeroes(this.game.heroesHere(), this.game.seenHere(), this.state.arriving(), this.state.leaving()));
    this.watchRatio();
    inject(DestroyRef).onDestroy(() => {
      this.ratioWatch.abort();
      this.mounts++;
      this.scene?.destroy();
    });
  }

  protected measure(): void {
    this.viewport.set({ width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio });
  }

  /** Measures again when the device pixel ratio changes, browser zoom or another screen, which a resize alone may not report. */
  private watchRatio(): void {
    const query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    query?.addEventListener(
      'change',
      () => {
        this.measure();
        this.watchRatio();
      },
      { once: true, signal: this.ratioWatch.signal },
    );
  }

  private async mount(): Promise<void> {
    const mount = ++this.mounts;
    this.scene?.destroy();
    this.scene = null;
    const layout = this.state.layout();
    if (!layout) return;
    const levels = Object.fromEntries(this.state.facilities().map((f) => [f.kind, f.level]));
    const scene = await this.createScene(this.stage().nativeElement, layout, levels, {
      onFacility: (kind) => void this.router.navigate(['/camp', this.location(), kind]),
      onHero: (id) =>
        void this.router.navigate(
          this.game.seenHere().some((h) => h.id === id)
            ? ['/camp', this.location(), 'seen', id]
            : ['/camp', this.location(), 'heroes-hall', 'heroes', id],
        ),
    });
    if (mount !== this.mounts) {
      scene.destroy();
      return;
    }
    this.scene = scene;
    this.showHeroes(this.game.heroesHere(), this.game.seenHere(), this.state.arriving(), this.state.leaving());
  }

  /** The living heroes walk about, with the few of other players' seen here; the dead and the retired are on the roster, not in the camp. */
  private showHeroes(
    heroes: readonly HeroView[],
    seen: readonly SeenHeroView[],
    arriving: string | undefined,
    leaving: string | undefined,
  ): void {
    this.scene?.setHeroes(
      [...heroes.filter((h) => h.status === 'ALIVE'), ...seen].map((h) => ({ id: h.id, spriteSet: h.spriteSet })),
      arriving,
      leaving,
    );
  }
}
