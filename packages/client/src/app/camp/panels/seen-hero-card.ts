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
  templateUrl: './seen-hero-card.html',
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
