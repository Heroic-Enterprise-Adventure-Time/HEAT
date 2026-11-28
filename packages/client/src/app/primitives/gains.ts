import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core';

import { FRAME_LOOP } from '../frame-loop';
import { REDUCED_MOTION } from '../reduced-motion';
import { countedAt } from './count-up';
import { heroGainWords, rewardWords } from './gain-words';
import { HeroTile, type TileHero } from './hero-tile';
import { ResourceChip } from './resource-chip';

/** A resource gained: what it is, as the hub names it, and how much of it. */
export interface GainedResource {
  readonly material: string;
  readonly amount: number;
}

/** What a hero gained. */
export interface GainedHero {
  readonly id: string;
  /** The hero as it was before the gain: its tile shows this level until its XP is counted. */
  readonly hero: TileHero;
  /** The XP gained. */
  readonly xp: number;
  /** The hero's level after the gain. */
  readonly level: number;
  /** Whether the hero died, and so gained nothing. */
  readonly died: boolean;
}

/**
 * A gains block (Issue-441): what was gained, resources as chips and heroes
 * as tiles with their XP, each amount counted up from nothing, one after the
 * other in the order shown (`count-up.ts`), and a hero who gained a level
 * given it, with a mark that pops, when its XP is whole. It is shown where
 * something was won, an adventure's result first. What its owner projects
 * into it stands between the resources and the heroes, as what a full
 * warehouse lost does on a result.
 *
 * The counting is moved by the page's frames (`FRAME_LOOP`), so a spec
 * steps it, and stops when every amount is whole. For a player who has
 * asked for less motion (`REDUCED_MOTION`) nothing is counted: every amount
 * is whole from the start, and the stylesheet pops nothing. A screen reader
 * is never given the counting: what moves is hidden from it, and each chip
 * and hero says its whole gain in words from the start (angular.md, rules
 * 14 and 23).
 */
@Component({
  selector: 'heat-gains',
  imports: [HeroTile, ResourceChip],
  templateUrl: './gains.html',
  styleUrl: './gains.css',
})
export class Gains {
  private readonly frames = inject(FRAME_LOOP);
  private readonly still = inject(REDUCED_MOTION);

  readonly resources = input<readonly GainedResource[]>([]);
  readonly heroes = input<readonly GainedHero[]>([]);

  /** How long the count has run, in milliseconds; past its end from the start for a player who asked for less motion. */
  private readonly elapsed = signal(this.still() ? Infinity : 0);
  /** Each amount as it shows now: the resources', then the heroes' XP. */
  private readonly counted = computed(() => countedAt([...this.resources().map((r) => r.amount), ...this.heroes().map((h) => (h.died ? 0 : h.xp))], this.elapsed()));

  protected readonly chips = computed(() =>
    this.resources().map((resource, index) => ({
      material: resource.material,
      shown: this.counted()[index]?.shown ?? resource.amount,
      words: rewardWords(resource),
    })),
  );
  protected readonly rows = computed(() => {
    const first = this.resources().length;
    return this.heroes().map((gained, index) => {
      const counted = this.counted()[first + index];
      const done = counted?.done ?? true;
      return {
        id: gained.id,
        tile: { ...gained.hero, level: done ? gained.level : gained.hero.level },
        died: gained.died,
        shown: counted?.shown ?? gained.xp,
        up: gained.level > gained.hero.level && done,
        words: heroGainWords(gained),
      };
    });
  });

  constructor() {
    if (this.still()) return;
    let stop = (): void => undefined;
    stop = this.frames((ms) => {
      this.elapsed.update((elapsed) => elapsed + ms);
      if (this.counted().every((counted) => counted.done)) stop();
    });
    inject(DestroyRef).onDestroy(() => { stop(); });
  }
}
