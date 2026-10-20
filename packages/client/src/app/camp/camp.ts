import { Component, DestroyRef, ElementRef, InjectionToken, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Game, type HeroView } from '../game';
import { LAYOUTS } from './scene/layout';
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

/**
 * The camp: the scene of the location on screen, and the panels its clicks
 * open, as page elements over it: the heroes hall with its roster and the
 * free villager, and a hero's card. The job board is drawn and does nothing
 * yet (Issue-15).
 */
@Component({
  selector: 'heat-camp',
  imports: [DatePipe],
  templateUrl: './camp.html',
  styleUrl: './camp.css',
})
export class Camp {
  protected readonly game = inject(Game);
  private readonly createScene = inject(CAMP_SCENE_FACTORY);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  protected readonly hallOpen = signal(false);
  protected readonly heroId = signal<string | null>(null);
  protected readonly hero = computed(() => this.game.heroesHere().find((h) => h.id === this.heroId()) ?? null);

  private scene: CampSceneHandle | null = null;
  private arriving: string | undefined;

  constructor() {
    afterNextRender(async () => {
      const layout = LAYOUTS[this.game.location()];
      if (!layout) return;
      this.scene = await this.createScene(this.stage().nativeElement, layout, {
        onFacility: (kind) => {
          if (kind === 'heroes-hall') {
            this.heroId.set(null);
            this.hallOpen.set(true);
          }
        },
        onHero: (id) => {
          this.hallOpen.set(false);
          this.heroId.set(id);
        },
      });
      this.showHeroes(this.game.heroesHere());
    });
    effect(() => this.showHeroes(this.game.heroesHere()));
    inject(DestroyRef).onDestroy(() => this.scene?.destroy());
  }

  protected async recruit(): Promise<void> {
    const hero = await this.game.recruitVillager();
    if (hero) {
      this.arriving = hero.id;
      this.showHeroes(this.game.heroesHere());
    }
  }

  protected close(): void {
    this.hallOpen.set(false);
    this.heroId.set(null);
  }

  /** The living heroes walk about; the dead are on the roster, not in the camp. */
  private showHeroes(heroes: readonly HeroView[]): void {
    this.scene?.setHeroes(
      heroes.filter((h) => h.status === 'ALIVE').map((h) => ({ id: h.id, spriteSet: h.spriteSet })),
      this.arriving,
    );
  }
}
