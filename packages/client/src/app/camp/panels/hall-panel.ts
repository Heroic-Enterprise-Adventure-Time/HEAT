import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../api';
import { Game, type RecruitOffer } from '../../game';
import { CampState } from '../camp-state';
import { FacilityBuild } from './facility-build';

/** The hub's refusals of a recruit, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<string, string>> = {
  HALL_LEVEL: 'The hall is not at the level this needs.',
  HALL_FULL: 'The hall is full.',
  INSUFFICIENT_RESOURCES: 'The camp cannot pay for this now.',
  CONFLICT: 'The camp changed while recruiting, and nobody was recruited. Try again.',
};

/** A recruit's price in words, each resource beside the camp's balance (game.md, "The page"). */
export function priceWords(offer: RecruitOffer): string {
  if (offer.cost.length === 0) return 'free';
  return offer.cost.map((c) => `${c.amount} ${c.material}, you have ${c.balance}`).join('; ');
}

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
  template: `
    <h2 id="panel-title">Heroes hall</h2>
    @if (game.camp(); as camp) {
      <p>Level {{ camp.hallLevel }}: {{ camp.activeHeroes }} of {{ camp.heroCapacity }} heroes.</p>
    }

    <h3>Living</h3>
    @if (game.livingHere().length > 0) {
      <ul class="roster living">
        @for (hero of game.livingHere(); track hero.id) {
          <li>
            <a class="link" [routerLink]="['heroes', hero.id]">{{ hero.name }}</a>
            <span>{{ hero.unitType }}, level {{ hero.level }}</span>
          </li>
        }
      </ul>
    } @else {
      <p>No living heroes.</p>
    }

    @if (dead().length > 0) {
      <h3>Dead</h3>
      <ul class="roster dead">
        @for (hero of dead(); track hero.id) {
          <li>
            <a class="link" [routerLink]="['heroes', hero.id]">{{ hero.name }}</a>
            <span>{{ hero.unitType }}, level {{ hero.level }}</span>
          </li>
        }
      </ul>
    }

    @if (game.retiredHere().length > 0) {
      <details class="retired">
        <summary>Retired ({{ game.retiredHere().length }})</summary>
        <ul class="roster">
          @for (hero of game.retiredHere(); track hero.id) {
            <li>
              <a class="link" [routerLink]="['heroes', hero.id]">{{ hero.name }}</a>
              <span>{{ hero.unitType }}, level {{ hero.level }}</span>
            </li>
          }
        </ul>
      </details>
    }

    <h3>Recruit</h3>
    <ul class="recruits">
      @for (offer of game.recruits(); track offer.unitType) {
        <li>
          <button type="button" (click)="recruit(offer)" [disabled]="game.busy() || offer.reason !== null">
            Recruit a {{ offer.unitType }}
          </button>
          <span class="price">{{ price(offer) }}</span>
          @if (refused(); as refused) {
            @if (refused.unitType === offer.unitType) {
              <p class="refusal" role="alert">{{ refused.words }}</p>
            }
          }
          @if (offer.reason && refused()?.unitType !== offer.unitType) {
            <p class="note">{{ offer.reason }}</p>
          }
        </li>
      }
    </ul>

    <heat-facility-build [kind]="'heroes-hall'" />
  `,
  styleUrl: './panel.css',
})
export class HallPanel {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);
  protected readonly dead = computed(() => this.game.heroesHere().filter((h) => h.status === 'DEAD'));
  /** The hub's last refusal, on the recruit it refused; cleared by the next try. */
  protected readonly refused = signal<{ unitType: string; words: string } | null>(null);
  protected readonly price = priceWords;

  protected async recruit(offer: RecruitOffer): Promise<void> {
    this.refused.set(null);
    try {
      const hero = await this.game.recruit(offer.unitType);
      this.camp.arriving.set(hero.id);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      this.refused.set({ unitType: offer.unitType, words: (code && REFUSALS[code]) ?? (e instanceof Error ? e.message : String(e)) });
    }
  }
}
