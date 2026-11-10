import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Game, type RetireRefusal } from '../../game';
import { refusalWords } from '../../hub';
import { CampState } from '../camp-state';

/** The hub's refusals of a retirement, by type, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<RetireRefusal, string>> = {
  HeroAdventuring: 'This hero is away on an adventure, and retires once it is settled.',
  Conflict: 'The camp changed while retiring, and nobody retired. Try again.',
};

/**
 * A hero's card, `/camp/<location>/heroes-hall/heroes/<id>`: under the hall,
 * so the menu keeps the hall marked. An active hero can be retired, behind a
 * confirmation in place, because retiring is permanent (game.md, "The heroes
 * hall"); a refusal from the hub is shown in place, under the confirmation.
 * A retired hero's card says so and offers nothing.
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
  /** Whether the retirement is under way, while the hub answers. */
  protected readonly pending = signal(false);
  /** The hub's last refusal; cleared by the next try. */
  protected readonly refused = signal<string | null>(null);

  protected async retire(id: string): Promise<void> {
    this.refused.set(null);
    this.pending.set(true);
    try {
      const hero = await this.game.retire(id);
      this.confirming.set(null);
      this.camp.leaving.set(hero.id);
    } catch (e) {
      this.refused.set(refusalWords(e, REFUSALS));
    } finally {
      this.pending.set(false);
    }
  }
}
