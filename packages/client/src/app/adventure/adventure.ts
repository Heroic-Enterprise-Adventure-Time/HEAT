import { Component, computed, effect, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { location } from '@heat/engine';
import { Game } from '../game';

/**
 * The open adventure, `/adventure`, which the header bar and the facility
 * menu lead to (Issue-115): its job and its party as the hub froze them at
 * the start. Playing it is Issue-15. With no adventure open, the address
 * goes to the camp.
 */
@Component({
  selector: 'heat-adventure',
  imports: [DatePipe, RouterLink],
  template: `
    <main>
      @if (game.adventure(); as adventure) {
        <h1>{{ adventure.job.name }}</h1>
        <p>{{ adventure.job.description }}</p>
        <p>Set out from {{ from() }} at {{ adventure.startedAt | date: 'shortTime' }}.</p>
        <h2>Party</h2>
        <ul>
          @for (hero of adventure.snapshot.heroes; track hero.heroId) {
            <li>
              <strong>{{ hero.name }}</strong> {{ hero.unitType }}, level {{ hero.level }}
            </li>
          }
        </ul>
        <p class="note">Playing an adventure comes in a later update.</p>
        <a [routerLink]="['/camp', adventure.location]">Back to {{ from() }}</a>
      } @else {
        <p>Loading…</p>
      }
    </main>
  `,
  styles: `
    main {
      max-width: 40rem;
      margin: 0 auto;
      padding: 1.5rem 1rem;
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
    }
    h2 {
      margin: 1rem 0 0.25rem;
      font-size: 1.1rem;
    }
    a {
      color: inherit;
    }
  `,
})
export class Adventure {
  protected readonly game = inject(Game);
  protected readonly from = computed(() => {
    const at = this.game.adventure()?.location ?? '';
    return location(at)?.name ?? at;
  });

  constructor() {
    const router = inject(Router);
    effect(() => {
      // Only once the player is loaded: before then, no adventure means not read yet.
      if (this.game.player() && !this.game.adventure()) void router.navigate(['/camp', this.game.location()], { replaceUrl: true });
    });
  }
}
