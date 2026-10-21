import { Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Game } from '../../game';

/** A hero's card, `/camp/<location>/heroes-hall/heroes/<id>`: under the hall, so the menu keeps the hall marked. */
@Component({
  selector: 'heat-hero-card',
  imports: [DatePipe, RouterLink],
  template: `
    <a class="back" routerLink="../..">← Heroes hall</a>
    @if (hero(); as hero) {
      <h2 id="panel-title">{{ hero.name }}</h2>
      <dl>
        <dt>Unit type</dt>
        <dd>{{ hero.unitType }}</dd>
        <dt>Level</dt>
        <dd>{{ hero.level }} ({{ hero.xp }} XP)</dd>
        <dt>Status</dt>
        <dd>{{ hero.status === 'ALIVE' ? 'alive' : hero.status === 'DEAD' ? 'dead' : 'retired' }}</dd>
        <dt>Recruited</dt>
        <dd>{{ hero.recruitedAt | date: 'mediumDate' }}</dd>
      </dl>
    } @else {
      <h2 id="panel-title">Hero</h2>
      <p>This camp has no such hero.</p>
    }
  `,
  styleUrl: './panel.css',
})
export class HeroCard {
  private readonly game = inject(Game);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  protected readonly hero = computed(() => this.game.heroesHere().find((h) => h.id === this.params()?.get('hero')) ?? null);
}
