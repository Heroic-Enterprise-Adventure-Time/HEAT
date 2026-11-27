import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input } from '@angular/core';

import type { Material } from '@heat/engine';

import { Icons } from '../icons';

/** A resource's icon is 32 art pixels square (docs/process/assets.md, rule 25), drawn here at scale 1. */
const ICON_PX = 32;

/**
 * A resource chip (decision 0061): a resource's icon and an amount, the one
 * way the page shows a reward, a cost or a holding. A resource with no icon
 * yet shows its name in the icon's place, so the chip always says what it
 * counts; with an icon, the name is the icon's alternative text.
 */
@Component({
  selector: 'heat-resource-chip',
  imports: [NgOptimizedImage],
  templateUrl: './resource-chip.html',
  styleUrl: './resource-chip.css',
})
export class ResourceChip {
  protected readonly icons = inject(Icons);
  protected readonly iconPx = ICON_PX;
  readonly material = input.required<Material>();
  readonly amount = input.required<number>();
}
