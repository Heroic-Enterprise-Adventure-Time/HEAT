import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CampState } from '../camp-state';

/**
 * Any other facility's panel, `/camp/<location>/<facility>`: what it does,
 * and for one not built yet, that it is not (building is Issue-93). The
 * hall and the job board have panels of their own; the warehouse fills in
 * later. A facility the camp does not have sends the address back to the hall.
 */
@Component({
  selector: 'heat-facility-panel',
  template: `
    @if (facility(); as facility) {
      <h2 id="panel-title">{{ facility.name }}</h2>
      @if (facility.level === 0) {
        <p class="status">Not built yet.</p>
        <p>{{ facility.description }}</p>
        <p class="note">Building opens in a later update.</p>
      } @else {
        <p>{{ facility.description }}</p>
        @switch (facility.kind) {
          @case ('warehouse') {
            <p>The warehouse is empty.</p>
          }
        }
      }
    }
  `,
  styleUrl: './panel.css',
})
export class FacilityPanel {
  private readonly camp = inject(CampState);
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
