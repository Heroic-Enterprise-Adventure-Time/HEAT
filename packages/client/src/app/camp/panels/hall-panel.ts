import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Game, type RecruitOffer, type RecruitRefusal } from '../../game';
import { refusalWords } from '../../hub';
import { CampState } from '../camp-state';
import { priceWords } from './cost-words';
import { FacilityBuild } from './facility-build';

/** The hub's refusals of a recruit, by type, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<RecruitRefusal, string>> = {
  HallLevel: 'The hall is not at the level this needs.',
  HallFull: 'The hall is full.',
  InsufficientResources: 'The camp cannot pay for this now.',
  Conflict: 'The camp changed while recruiting, and nobody was recruited. Try again.',
};

/**
 * The heroes hall's panel, `/camp/<location>/heroes-hall` (game.md, "The
 * heroes hall" and "The page"): the hall's count against its cap; the
 * roster grouped living, dead and retired, the retired collapsed; and every
 * unit type the location recruits, its price beside the camp's balance and
 * why it cannot be had now. A refusal from the hub is shown in place, on
 * the recruit it refused. Last, the hall's next level (Issue-93).
 */
@Component({
  selector: 'heat-hall-panel',
  imports: [RouterLink, FacilityBuild],
  templateUrl: './hall-panel.html',
  styleUrl: './panel.css',
})
export class HallPanel {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);
  protected readonly dead = computed(() => this.game.heroesHere().filter((h) => h.status === 'DEAD'));
  /** The unit type being recruited while the hub answers; every recruit waits for it. */
  protected readonly pending = signal<string | null>(null);
  /** The hub's last refusal, on the recruit it refused; cleared by the next try. */
  protected readonly refused = signal<{ unitType: string; words: string } | null>(null);
  protected readonly price = priceWords;

  protected async recruit(offer: RecruitOffer): Promise<void> {
    this.refused.set(null);
    this.pending.set(offer.unitType);
    try {
      const hero = await this.game.recruit(offer.unitType);
      this.camp.arriving.set(hero.id);
    } catch (e) {
      this.refused.set({ unitType: offer.unitType, words: refusalWords(e, REFUSALS) });
    } finally {
      this.pending.set(null);
    }
  }
}
