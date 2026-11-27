import { Component, input, output } from '@angular/core';

import type { HeroView } from '../game';

/** What a tile says of a hero, until Issue-385's portraits: its name, its unit type and its level. */
export type TileHero = Pick<HeroView, 'level' | 'name' | 'unitType'>;

/**
 * A hero tile (decision 0061): a hero picked, not picked, or an empty slot.
 * A hero's tile is a toggle, a button pressed while the hero is picked, and
 * only the picked hero has the ink outline; a hero not picked has a soft tan
 * one. An empty slot is no control.
 */
@Component({
  selector: 'heat-hero-tile',
  templateUrl: './hero-tile.html',
  styleUrl: './hero-tile.css',
})
export class HeroTile {
  /** The hero, or null for an empty slot. */
  readonly hero = input.required<TileHero | null>();
  readonly picked = input(false);
  readonly toggled = output();
}
