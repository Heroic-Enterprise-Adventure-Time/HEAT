import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';

import type { HeroView } from '../game';
import { Icons } from '../icons';
import { PORTRAIT } from '../sprite-sets';

/** What a tile shows of a hero: its portrait, from its sprite set, its name, its unit type and its level. */
export type TileHero = Pick<HeroView, 'level' | 'name' | 'spriteSet' | 'unitType'>;

/**
 * A hero tile (decision 0061): a hero picked, not picked, or an empty slot.
 * A hero's tile is a toggle, a button pressed while the hero is picked, and
 * only the picked hero has the ink outline; a hero not picked has a soft tan
 * one. An empty slot is no control. A hero's portrait is its sprite set's
 * head and shoulders, cut by the build (`PORTRAIT`); a set with none shows
 * no picture, and the tile still names the hero.
 */
@Component({
  selector: 'heat-hero-tile',
  imports: [NgOptimizedImage],
  templateUrl: './hero-tile.html',
  styleUrl: './hero-tile.css',
})
export class HeroTile {
  protected readonly icons = inject(Icons);
  /** The portrait's own pixels, which the stylesheet draws at a whole-number scale. */
  protected readonly portraitPx = PORTRAIT.side;
  /** The hero, or null for an empty slot. */
  readonly hero = input.required<TileHero | null>();
  readonly picked = input(false);
  readonly toggled = output();
}
