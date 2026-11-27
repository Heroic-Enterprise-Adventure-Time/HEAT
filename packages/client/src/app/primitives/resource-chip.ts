import { NgOptimizedImage } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';

import { ICON_PX } from '../icon-names';
import { Icons } from '../icons';

/**
 * A resource chip (decision 0061): a resource's icon and an amount, the one
 * way the page shows a reward, a cost or a holding. A resource with no icon
 * yet shows its name in the icon's place, so the chip always says what it
 * counts; with an icon, the name is the icon's alternative text.
 *
 * A cost is given the camp's balance as `have`. A cost the camp cannot meet
 * is short: rust, with a dashed outline so that it does not rest on colour
 * alone (WCAG 1.4.1), and named so to a screen reader.
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
  /**
   * The resource, as the hub names it: a material this client's engine does
   * not know, sent by a newer deploy, is shown by its name (angular.md, rule 6).
   */
  readonly material = input.required<string>();
  readonly amount = input.required<number>();
  /** The camp's balance of the resource, for a cost; null for a reward or a holding. */
  readonly have = input<number | null>(null);
  protected readonly short = computed(() => {
    const have = this.have();
    return have !== null && have < this.amount();
  });
}
