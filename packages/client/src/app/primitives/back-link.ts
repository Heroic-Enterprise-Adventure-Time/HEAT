import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from './icon';

/**
 * The way back from a panel's detail to the list it came from (decision
 * 0062): a link, since it goes to another panel and changes nothing, with
 * the `back` icon, a green arrow, and the name of where it goes. Its name
 * says "Back to" before that, for a screen reader, so that it is told apart
 * from the menu's entry of the same panel. The link is relative to the
 * panel's route, as a `routerLink` in the panel's own template would be.
 * Its `close` kind is the way out of a view over the camp, a battle or a
 * replay, with the `close` icon, a red X, in place of the arrow.
 */
@Component({
  selector: 'heat-back-link',
  imports: [Icon, RouterLink],
  templateUrl: './back-link.html',
  styleUrl: './back-link.css',
})
export class BackLink {
  /** Where it goes, as `routerLink` takes it: `../..`. */
  readonly to = input.required<string | readonly unknown[]>();
  /** The name of the panel it goes back to: "Heroes hall". */
  readonly label = input.required<string>();
  /** Which way out, and so its icon: `back` through the panels, `close` out of a view over the camp (decision 0062). */
  readonly kind = input<'back' | 'close'>('back');
}
