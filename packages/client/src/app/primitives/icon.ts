import { NgOptimizedImage } from '@angular/common';
import { Component, inject, input } from '@angular/core';

import { ICON_PX } from '../icon-names';
import { Icons } from '../icons';

/**
 * One of the page's icons (docs/process/assets.md, rules 25 to 27), beside
 * the word of the control it stands on: an action's icon on its button
 * (decision 0062) or a way out's on its link. It is decoration, since the
 * word beside it names the control, so its alternative text is empty; an
 * icon the index does not hold, or not yet, draws nothing, and the word
 * still says what the control does.
 */
@Component({
  selector: 'heat-icon',
  imports: [NgOptimizedImage],
  templateUrl: './icon.html',
  styleUrl: './icon.css',
})
export class Icon {
  protected readonly icons = inject(Icons);
  protected readonly px = ICON_PX;
  /** The icon's name in the index: `depart`, `back`. */
  readonly name = input.required<string>();
}
