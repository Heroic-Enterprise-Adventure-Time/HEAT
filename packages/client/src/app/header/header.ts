import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
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

  private readonly router = inject(Router);

  /** A camp is an address, so choosing one goes there; the camp sets the game's location from it. */
  protected selectLocation(event: Event): void {
    void this.router.navigate(['/camp', (event.target as HTMLSelectElement).value]);
  }
}
