import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { Game } from '../../game';
import { CampState } from '../camp-state';
import { FacilityBuild } from './facility-build';

/**
 * Any other facility's panel, `/camp/<location>/<facility>`: what it does,
 * its level, and the build of it or of its next level (Issue-93). The hall
 * and the job board have panels of their own; the warehouse lists the camp's
 * stock against its cap (Issue-15). A facility the camp does not have sends
 * the address back to the hall.
 */
@Component({
  selector: 'heat-facility-panel',
  imports: [FacilityBuild],
  template: `
    @if (facility(); as facility) {
      <h2 id="panel-title">{{ facility.name }}</h2>
      @if (facility.level === 0) {
        <p class="status">Not built yet.</p>
        <p>{{ facility.description }}</p>
      } @else {
        <p class="status">Level {{ facility.level }}.</p>
        <p>{{ facility.description }}</p>
        @switch (facility.kind) {
          @case ('warehouse') {
            @if (stock().length === 0) {
              <p>The warehouse is empty.</p>
            } @else {
              <ul class="stock">
                @for (holding of stock(); track holding.material) {
                  <li>{{ holding.balance }} of {{ game.camp()?.resourceCapacity }} {{ holding.material }}</li>
                }
              </ul>
            }
          }
        }
      }
      <heat-facility-build [kind]="facility.kind" />
    }
  `,
  styleUrl: './panel.css',
})
export class FacilityPanel {
  private readonly camp = inject(CampState);
  protected readonly game = inject(Game);
  /** The camp's stock against the warehouse's cap ("The page"): what an adventure's settlement credits. */
  protected readonly stock = computed(() => (this.game.camp()?.holdings ?? []).filter((h) => h.balance > 0));
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap);
  protected readonly facility = computed(() => this.camp.facility(this.params()?.get('facility')));

  constructor() {
    const router = inject(Router);
    effect(() => {
      if (this.params() && this.camp.facilities().length > 0 && !this.facility()) {
        void router.navigate(['../heroes-hall'], { relativeTo: this.route, replaceUrl: true });
      }
    });
  }
}
