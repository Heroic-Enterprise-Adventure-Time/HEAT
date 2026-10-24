import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Game } from '../../game';
import { CampState } from '../camp-state';

/**
 * A hero's card, `/camp/<location>/heroes-hall/heroes/<id>`: under the hall,
 * so the menu keeps the hall marked. An active hero can be retired, behind a
 * confirmation in place, because retiring is permanent (game.md, "The heroes
 * hall"); a retired hero's card says so and offers nothing.
 */
@Component({
  selector: 'heat-hero-card',
  imports: [DatePipe, RouterLink],
  templateUrl: './hero-card.html',
  styleUrl: './panel.css',
})
export class HeroCard {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  protected readonly hero = computed(() => {
    const id = this.params()?.get('hero');
    return [...this.game.heroesHere(), ...this.game.retiredHere()].find((h) => h.id === id) ?? null;
  });
  /** The hero whose retirement is being confirmed: by id, so another hero's card never opens confirmed. */
  protected readonly confirming = signal<string | null>(null);

  protected async retire(id: string): Promise<void> {
    const hero = await this.game.retire(id);
    this.confirming.set(null);
    if (hero) this.camp.leaving.set(hero.id);
  }
}
