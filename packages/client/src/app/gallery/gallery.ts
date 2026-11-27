import { NgOptimizedImage } from '@angular/common';
import { Component, signal } from '@angular/core';

import type { Material } from '@heat/engine';

import { MAP_HEIGHT, MAP_WIDTH } from '../camp/scene/layout';
import { HeroTile, type TileHero } from '../primitives/hero-tile';
import { ResourceChip } from '../primitives/resource-chip';

/** The frame of the scene the gallery shows the primitives beside (docs/runbooks/capture-scene.md), served by angular.json from gallery/. */
const SCENE_FRAME = '/gallery/camp-millbrook-3x.png';
/** The frame is the whole map at scale 3. */
const SCENE_SCALE = 3;

/**
 * The gallery (Issue-384): every shared primitive in every state, on the
 * page and on a panel, beside a real frame of the scene, so that the theme
 * and the art are reviewed on one page at the stack's URL. It reads nothing
 * from the hub and needs no sign-in. The heroes and the amounts are samples.
 */
@Component({
  selector: 'heat-gallery',
  imports: [HeroTile, NgOptimizedImage, ResourceChip],
  templateUrl: './gallery.html',
  styleUrl: './gallery.css',
})
export class Gallery {
  protected readonly sceneFrame = SCENE_FRAME;
  protected readonly sceneWidth = MAP_WIDTH * SCENE_SCALE;
  protected readonly sceneHeight = MAP_HEIGHT * SCENE_SCALE;
  protected readonly materials: readonly Material[] = ['timber', 'ore', 'hide', 'cloth', 'stone'];
  protected readonly heroes: readonly TileHero[] = [
    { name: 'Wren', unitType: 'ranger', level: 3 },
    { name: 'Bram', unitType: 'knight', level: 1 },
  ];
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
