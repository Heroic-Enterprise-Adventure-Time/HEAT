import { Component, inject } from '@angular/core';
import { Game } from '../game';
import { Session } from '../session';

/**
 * The thin header bar above the scene: the title, the location select, the
 * open adventure, and sign-in. It is part of the page, not of the 320×180
 * scene, so it reads at any scale (decision 0026).
 */
@Component({
  selector: 'heat-header',
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  protected readonly session = inject(Session);
  protected readonly game = inject(Game);

  protected selectLocation(event: Event): void {
    this.game.location.set((event.target as HTMLSelectElement).value);
  }
}
