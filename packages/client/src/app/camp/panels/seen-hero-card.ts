import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Game } from '../../game';

/**
 * Another player's hero, `/camp/<location>/seen/<id>`: who it is and nothing
 * more. Its card shows the public fields only, never whose hero it is, and
 * offers nothing to do, because nothing is done through other players'
 * heroes (game.md, "Locations and camps"; decision 0029).
 */
@Component({
  selector: 'heat-seen-hero-card',
  imports: [RouterLink],
  template: `
    <a class="back" routerLink="../..">← Heroes hall</a>
    @if (hero(); as hero) {
      <h2 id="panel-title">{{ hero.name }}</h2>
      <p>Another company's hero, seen about the camp.</p>
      <dl>
        <dt>Unit type</dt>
        <dd>{{ hero.unitType }}</dd>
        <dt>Level</dt>
        <dd>{{ hero.level }}</dd>
      </dl>
    } @else {
      <h2 id="panel-title">Hero</h2>
      <p>That hero has moved on.</p>
    }
  `,
  styleUrl: './panel.css',
})
export class SeenHeroCard {
  private readonly game = inject(Game);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  protected readonly hero = computed(() => {
    const id = this.params()?.get('hero');
    return this.game.seenHere().find((h) => h.id === id) ?? null;
  });
}
