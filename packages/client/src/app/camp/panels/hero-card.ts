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
        @if (hero.status === 'RETIRED') {
          <dd>retired{{ hero.retiredAt ? ' on ' + (hero.retiredAt | date: 'mediumDate') : '' }}</dd>
        } @else {
          <dd>{{ hero.status === 'ALIVE' ? 'alive' : 'dead' }}</dd>
        }
        <dt>Recruited</dt>
        <dd>{{ hero.recruitedAt | date: 'mediumDate' }}</dd>
      </dl>

      @if (hero.status !== 'RETIRED') {
        @if (confirming() === hero.id) {
          <div class="confirm" role="group" aria-labelledby="retire-question">
            <p id="retire-question">
              Retire <strong>{{ hero.name }}</strong>? Retiring is permanent. {{ hero.name }} leaves the hall for good and
              frees a slot; the record stays.
            </p>
            <button type="button" (click)="retire(hero.id)" [disabled]="game.busy()">Retire {{ hero.name }}</button>
            <button type="button" (click)="confirming.set(null)" [disabled]="game.busy()">Keep</button>
          </div>
        } @else {
          <button type="button" class="retire" (click)="confirming.set(hero.id)">Retire</button>
        }
      }
    } @else {
      <h2 id="panel-title">Hero</h2>
      <p>This camp has no such hero.</p>
    }
  `,
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
