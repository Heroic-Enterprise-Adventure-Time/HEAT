import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Game } from '../../game';
import { CampState } from '../camp-state';

/** The heroes hall's panel, `/camp/<location>/heroes-hall`: the hall's count, the roster with the retired apart, and the free villager. */
@Component({
  selector: 'heat-hall-panel',
  imports: [RouterLink],
  template: `
    <h2 id="panel-title">Heroes hall</h2>
    @if (game.camp(); as camp) {
      <p>Level {{ camp.hallLevel }}: {{ camp.activeHeroes }} of {{ camp.heroCapacity }} heroes.</p>
    }

    @if (game.heroesHere().length > 0) {
      <ul class="roster">
        @for (hero of game.heroesHere(); track hero.id) {
          <li>
            <a class="link" [routerLink]="['heroes', hero.id]">{{ hero.name }}</a>
            <span>{{ hero.unitType }}, level {{ hero.level }}</span>
            @if (hero.status === 'DEAD') {
              <span class="dead">dead</span>
            }
          </li>
        }
      </ul>
    } @else {
      <p>No heroes yet.</p>
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

    @if (game.freeVillager(); as free) {
      @if (free.offered) {
        <button type="button" (click)="recruit()" [disabled]="game.busy()">Recruit a villager, free</button>
      } @else if (free.reason) {
        <p class="note">{{ free.reason }}</p>
      }
    }
  `,
  styleUrl: './panel.css',
})
export class HallPanel {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);

  protected async recruit(): Promise<void> {
    const hero = await this.game.recruitVillager();
    if (hero) this.camp.arriving.set(hero.id);
  }
}
