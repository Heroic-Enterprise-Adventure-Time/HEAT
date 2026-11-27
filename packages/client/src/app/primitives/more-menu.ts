import { Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from './icon';

/** One of a panel's secondary views: its name and where it is, as `routerLink` takes it, relative to the panel. */
export interface MoreItem {
  readonly label: string;
  readonly to: string | readonly unknown[];
}

/**
 * A panel's own "more" (⋯) menu (decision 0061; game.md, "The page"): a
 * button in the panel's title that shows and hides a short list of links to
 * the panel's secondary views, such as the job board's "Recently here". It
 * is a disclosure and not an ARIA menu, because what it holds is
 * navigation: the button says whether it is open with `aria-expanded`, and
 * the links are ordinary links in the tab order. While it is open the
 * button shows the `close` icon, a red X, as a menu over the page does
 * (decision 0062), and Escape closes it and gives the button back its focus.
 */
@Component({
  selector: 'heat-more-menu',
  imports: [Icon, RouterLink],
  templateUrl: './more-menu.html',
  styleUrl: './more-menu.css',
  host: {
    '(keydown.escape)': 'close()',
  },
})
export class MoreMenu {
  readonly items = input.required<readonly MoreItem[]>();
  /** The id of the list, which the button controls; unique on the page. */
  readonly id = input.required<string>();
  protected readonly open = signal(false);
  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.button().nativeElement.focus();
  }
}
