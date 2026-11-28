import { NgOptimizedImage } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { MATERIALS } from '@heat/engine';

import { MAP_HEIGHT, MAP_WIDTH } from '../camp/scene/layout';
import { BackLink } from '../primitives/back-link';
import { HeroTile, type TileHero } from '../primitives/hero-tile';
import { Icon } from '../primitives/icon';
import { type MoreItem, MoreMenu } from '../primitives/more-menu';
import { ResourceChip } from '../primitives/resource-chip';
import { Slots } from '../primitives/slots';

/** The frame of the scene the gallery shows the primitives beside (docs/runbooks/capture-scene.md), served by angular.json from gallery/. */
const SCENE_FRAME = '/gallery/camp-millbrook-3x.png';
/** The frame is the whole map at scale 3. */
const SCENE_SCALE = 3;

/** The sample heroes; the first stands beside the scene. */
const WREN: TileHero = { name: 'Wren', unitType: 'ranger', level: 3, spriteSet: 'ranger-01' };
const BRAM: TileHero = { name: 'Bram', unitType: 'knight', level: 1, spriteSet: 'knight-06' };

/** A button's kind, with the classes each of its states takes. */
interface ButtonKind {
  readonly name: string;
  readonly classes: string;
  readonly focusClasses: string;
}

/**
 * The gallery (Issue-384): every shared primitive in every state, on the
 * page and on a panel, beside a real frame of the scene, so that the theme
 * and the art are reviewed on one page at the stack's URL. It reads nothing
 * from the hub and needs no sign-in. The heroes and the amounts are samples.
 */
@Component({
  selector: 'heat-gallery',
  imports: [BackLink, HeroTile, Icon, MoreMenu, NgOptimizedImage, ResourceChip, RouterLink, Slots],
  templateUrl: './gallery.html',
  styleUrl: './gallery.css',
})
export class Gallery {
  /** The action icons (Issue-385), each on a button with its word. */
  protected readonly actions = [
    { icon: 'depart', label: 'Depart', classes: 'button primary' },
    { icon: 'recruit', label: 'Recruit', classes: 'button primary' },
    { icon: 'build', label: 'Build', classes: 'button primary' },
    { icon: 'replays', label: 'Replays', classes: 'button secondary' },
    { icon: 'settings', label: 'Settings', classes: 'button secondary' },
    { icon: 'back', label: 'Back', classes: 'button secondary' },
  ] as const;
  /** The icons a button may show alone, its word its accessible name. */
  protected readonly iconOnly = [
    { icon: 'close', label: 'Close' },
    { icon: 'more', label: 'More' },
  ] as const;
  protected readonly sceneFrame = SCENE_FRAME;
  protected readonly sceneWidth = MAP_WIDTH * SCENE_SCALE;
  protected readonly sceneHeight = MAP_HEIGHT * SCENE_SCALE;
  /** The buttons are shown on the page and on a panel. */
  protected readonly surfaces = [
    { name: 'page', panel: false },
    { name: 'panel', panel: true },
  ] as const;
  protected readonly kinds: readonly ButtonKind[] = ['primary', 'secondary'].map((name) => ({
    name,
    classes: `button ${name}`,
    focusClasses: `button ${name} focus`,
  }));
  /** Every material, each with a sample amount. */
  protected readonly chips = MATERIALS.map((material, index) => ({ material, amount: index * 25 + 4 }));
  /** A cost the camp can meet, and one it cannot. */
  protected readonly costs = [
    { material: 'timber', amount: 40, have: 52 },
    { material: 'ore', amount: 30, have: 12 },
  ] as const;
  /** A hall empty, part full and full. */
  protected readonly slotCounts = [
    { filled: 0, total: 4 },
    { filled: 2, total: 4 },
    { filled: 4, total: 4 },
  ] as const;
  protected readonly heroes: readonly TileHero[] = [WREN, BRAM];
  /** A panel's more menu holds links to its secondary views; here, back to the gallery. */
  protected readonly more: readonly MoreItem[] = [{ label: 'Recently here', to: '/gallery' }];
  protected readonly sceneHero = WREN;
  /** The hero the disabled and still tiles show. */
  protected readonly spareHero = BRAM;
  /** The first sample hero starts picked; a tile toggles as it would in a party pick. */
  protected readonly picked = signal<ReadonlySet<string>>(new Set(['Wren']));
  protected toggle(name: string): void {
    this.picked.update((picked) => {
      const next = new Set(picked);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }
}
