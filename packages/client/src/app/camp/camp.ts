import { Component, DestroyRef, ElementRef, InjectionToken, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import type { FacilityKind } from '@heat/engine';
import { Game, type HeroView } from '../game';
import { LAYOUTS } from './scene/layout';
import { menuLabels } from './page-layout';
import type { CampSceneHandle, SceneCallbacks } from './scene/camp-scene';
import type { CampLayout } from './scene/layout';

/** How the camp gets its scene; a test provides one that draws nothing, since jsdom has no WebGL. */
export const CAMP_SCENE_FACTORY = new InjectionToken<(host: HTMLElement, layout: CampLayout, callbacks: SceneCallbacks) => Promise<CampSceneHandle>>(
  'heat.camp.scene',
  {
    providedIn: 'root',
    // Loaded on first use, so PixiJS is a chunk of its own, not in the initial bundle.
    factory: () => async (host, layout, callbacks) => (await import('./scene/camp-scene')).createCampScene(host, layout, callbacks),
  },
);

const FACILITY_NAMES: Readonly<Record<FacilityKind, string>> = {
  'heroes-hall': 'Heroes hall',
  'job-board': 'Job board',
  warehouse: 'Warehouse',
};

/**
 * The camp, in the page's regions (Issue-89): the facility menu on the left,
 * the scene of the location on screen, and the content area on the right,
 * which shows one panel at a time over the scene. A panel opens from the
 * menu or from a click in the scene, and lives in the URL, `?open=<facility>`
 * or `?hero=<id>`, so the browser's back closes it and a reload keeps it.
 * The heroes hall has its roster and the free villager; the job board and the
 * warehouse are empty until Issue-15 brings jobs and resources.
 */
@Component({
  selector: 'heat-camp',
  imports: [DatePipe, RouterLink],
  templateUrl: './camp.html',
  styleUrl: './camp.css',
  host: {
    '(window:resize)': 'measure()',
    '(document:keydown.escape)': 'close()',
  },
})
export class Camp {
  protected readonly game = inject(Game);
  private readonly router = inject(Router);
  private readonly createScene = inject(CAMP_SCENE_FACTORY);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap);

  private readonly layout = computed(() => LAYOUTS[this.game.location()] ?? null);
  protected readonly facilities = computed(() =>
    (this.layout()?.facilities ?? []).map((f) => ({ kind: f.kind, name: FACILITY_NAMES[f.kind] })),
  );

  protected readonly heroId = computed(() => this.query()?.get('hero') ?? null);
  protected readonly hero = computed(() => this.game.heroesHere().find((h) => h.id === this.heroId()) ?? null);
  /** The facility whose panel is open; none while a hero's card is. */
  protected readonly open = computed((): FacilityKind | null => {
    if (this.heroId()) return null;
    const open = this.query()?.get('open');
    return this.facilities().some((f) => f.kind === open) ? (open as FacilityKind) : null;
  });

  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight });
  protected readonly labels = computed(() => menuLabels(this.viewport().width, this.viewport().height));

  private scene: CampSceneHandle | null = null;
  private arriving: string | undefined;

  constructor() {
    afterNextRender(async () => {
      const layout = this.layout();
      if (!layout) return;
      this.scene = await this.createScene(this.stage().nativeElement, layout, {
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

  /** Closes the panel in place, so back goes to what was before it rather than reopening it. */
  protected close(): void {
    if (this.open() || this.heroId()) void this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  /** The living heroes walk about; the dead are on the roster, not in the camp. */
  private showHeroes(heroes: readonly HeroView[]): void {
    this.scene?.setHeroes(
      heroes.filter((h) => h.status === 'ALIVE').map((h) => ({ id: h.id, spriteSet: h.spriteSet })),
      this.arriving,
    );
  }
}
