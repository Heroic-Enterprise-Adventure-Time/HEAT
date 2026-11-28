import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { HeroView } from '../game';
import { Icons } from '../icons';
import { PORTRAIT } from '../sprite-sets';

/** What a tile shows of a hero: its portrait, from its sprite set, its name, its unit type and its level. */
export type TileHero = Pick<HeroView, 'level' | 'name' | 'spriteSet' | 'unitType'>;

/** Numbers each tile's ids, unique on the page. */
let tiles = 0;

/**
 * A hero tile (decision 0061): a hero picked, not picked, or an empty slot.
 * A hero's tile is a toggle by default, a button pressed while the hero is
 * picked, as in a party pick, and only the picked hero has the ink outline
 * and the sage fill (Issue-440); a hero not picked has a soft tan outline. Given a `link`, it is a link to the
 * hero instead, as in the hall's roster, since going to a hero's card
 * changes nothing (game.md, "The page"); `still`, it is no control, as for a
 * hero on its way to the camp. An empty slot is no control. A hero's
 * portrait is its sprite set's head and shoulders, cut by the build
 * (`PORTRAIT`); a set with none shows no picture, and the tile still names
 * the hero. A tile that is a control is named by its hero's name alone and
 * described by its unit type and level, so that a hero is found by name.
 */
@Component({
  selector: 'heat-hero-tile',
  imports: [NgOptimizedImage, NgTemplateOutlet, RouterLink],
  templateUrl: './hero-tile.html',
  styleUrl: './hero-tile.css',
})
export class HeroTile {
  protected readonly icons = inject(Icons);
  /** The portrait's own pixels, which the stylesheet draws at a whole-number scale. */
  protected readonly portraitPx = PORTRAIT.side;
  protected readonly nameId = `hero-tile-${++tiles}-name`;
  protected readonly detailId = `hero-tile-${tiles}-detail`;
  /** The hero, or null for an empty slot. */
  readonly hero = input.required<TileHero | null>();
  readonly picked = input(false);
  /** A toggle that cannot be pressed now, such as a hero beyond a full party; its reason is the pick's to show. */
  readonly disabled = input(false);
  /** Where the tile goes, as `routerLink` takes it, relative to the panel; null for a toggle. */
  readonly link = input<string | readonly unknown[] | null>(null);
  /** No control: the hero shown, not picked and not linked. */
  readonly still = input(false);
  readonly toggled = output();
}
