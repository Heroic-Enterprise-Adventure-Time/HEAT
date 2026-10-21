import { Component, DestroyRef, ElementRef, InjectionToken, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FACILITIES, location, type FacilityKind } from '@heat/engine';
import { Game, type HeroView } from '../game';
import { LAYOUTS } from './scene/layout';
import { iconScale, isSideBySide, menuLabels, stackedStageHeight } from './page-layout';
import type { CampSceneHandle, SceneCallbacks } from './scene/camp-scene';
import type { CampLayout } from './scene/layout';

/** How the camp gets its scene; a test provides one that draws nothing, since jsdom has no WebGL. */
export type CampSceneFactory = (
  host: HTMLElement,
  layout: CampLayout,
  levels: Readonly<Partial<Record<FacilityKind, number>>>,
  callbacks: SceneCallbacks,
) => Promise<CampSceneHandle>;

export const CAMP_SCENE_FACTORY = new InjectionToken<CampSceneFactory>('heat.camp.scene', {
  providedIn: 'root',
  // Loaded on first use, so PixiJS is a chunk of its own, not in the initial bundle.
  factory: () => async (host, layout, levels, callbacks) => (await import('./scene/camp-scene')).createCampScene(host, layout, levels, callbacks),
});

export interface FacilityEntry {
  readonly kind: FacilityKind;
  readonly name: string;
  readonly description: string;
  /** 0 until the camp builds it; building is not designed yet, so every buildable facility is 0 for now. */
  readonly level: number;
}

/**
 * The camp, in the page's regions (Issue-89): the facility menu, the scene,
 * and the content area beside it, which always shows one panel and never
 * covers the scene. The panel is the heroes hall unless the address names
 * another, `?open=<facility>` or `?hero=<id>`, so back returns to the last
 * panel and a reload keeps it. The menu and the scene both switch it. Every
 * facility the camp has or may build is listed and drawn; one not yet built
 * stands as an unfinished building, and its panel says what it will do.
 */
@Component({
  selector: 'heat-camp',
  imports: [DatePipe, RouterLink],
  templateUrl: './camp.html',
  styleUrl: './camp.css',
  host: {
    '(window:resize)': 'measure()',
  },
})
export class Camp {
  protected readonly game = inject(Game);
  private readonly router = inject(Router);
  private readonly createScene = inject(CAMP_SCENE_FACTORY);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  private readonly layout = computed(() => LAYOUTS[this.game.location()] ?? null);
  /** The camp's facilities in the layout's order, each with its level: built ones at 1, the rest at 0. */
  protected readonly facilities = computed((): FacilityEntry[] => {
    const content = location(this.game.location());
    const unbuilt = new Set(content?.buildableFacilities ?? []);
    return (this.layout()?.facilities ?? []).map((f) => ({ kind: f.kind, ...FACILITIES[f.kind], level: unbuilt.has(f.kind) ? 0 : 1 }));
  });

  protected readonly heroId = computed(() => this.query()?.get('hero') ?? null);
  protected readonly hero = computed(() => this.game.heroesHere().find((h) => h.id === this.heroId()) ?? null);
  /** The facility whose panel is showing: the one the address names, else the heroes hall; none while a hero's card is. */
  protected readonly open = computed((): FacilityEntry | null => {
    if (this.hero()) return null;
    const named = this.query()?.get('open');
    const facilities = this.facilities();
    return facilities.find((f) => f.kind === named) ?? facilities.find((f) => f.kind === 'heroes-hall') ?? null;
  });

  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight });
  protected readonly side = computed(() => isSideBySide(this.viewport().width, this.viewport().height));
  protected readonly labels = computed(() => menuLabels(this.viewport().width, this.viewport().height));
  protected readonly iconPx = computed(() => 32 * iconScale(this.viewport().width, this.viewport().height));
  /** Stacked, the scene's box is the page's width by the map's height at the scale that fits; side by side the grid sizes it. */
  protected readonly stageHeight = computed(() =>
    this.side() ? null : stackedStageHeight(this.viewport().width, this.viewport().height),
  );

  private scene: CampSceneHandle | null = null;
  private arriving: string | undefined;

  constructor() {
    afterNextRender(async () => {
      const layout = this.layout();
      if (!layout) return;
      const levels = Object.fromEntries(this.facilities().map((f) => [f.kind, f.level]));
      this.scene = await this.createScene(this.stage().nativeElement, layout, levels, {
        onFacility: (kind) => void this.router.navigate([], { queryParams: { open: kind } }),
        onHero: (id) => void this.router.navigate([], { queryParams: { hero: id } }),
      });
      this.showHeroes(this.game.heroesHere());
    });
    effect(() => this.showHeroes(this.game.heroesHere()));
    inject(DestroyRef).onDestroy(() => this.scene?.destroy());
  }

  protected measure(): void {
    this.viewport.set({ width: window.innerWidth, height: window.innerHeight });
  }

  protected async recruit(): Promise<void> {
    const hero = await this.game.recruitVillager();
    if (hero) {
      this.arriving = hero.id;
      this.showHeroes(this.game.heroesHere());
    }
  }

  /** The living heroes walk about; the dead are on the roster, not in the camp. */
  private showHeroes(heroes: readonly HeroView[]): void {
    this.scene?.setHeroes(
      heroes.filter((h) => h.status === 'ALIVE').map((h) => ({ id: h.id, spriteSet: h.spriteSet })),
      this.arriving,
    );
  }
}
