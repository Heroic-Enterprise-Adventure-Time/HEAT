import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { Game } from '../../game';
import { CampState } from '../camp-state';
import { FacilityBuild } from './facility-build';
import { JobList } from './job-list';
import { jobsAt } from './job-words';

/**
 * Any other facility's panel, `/camp/<location>/<facility>`: what it does,
 * its level, the jobs it posts once built (Issue-133), and the build of it
 * or of its next level (Issue-93). The hall
 * and the job board have panels of their own; the warehouse lists the camp's
 * stock against its cap (Issue-15). A facility the camp does not have sends
 * the address back to the hall.
 */
@Component({
  selector: 'heat-facility-panel',
  imports: [FacilityBuild, JobList],
  templateUrl: './facility-panel.html',
  styleUrl: './panel.css',
})
export class FacilityPanel {
  private readonly camp = inject(CampState);
  protected readonly game = inject(Game);
  private readonly route = inject(ActivatedRoute);
  /** The camp's stock against the warehouse's cap ("The page"): what an adventure's settlement credits. */
  protected readonly stock = computed(() => (this.game.camp()?.holdings ?? []).filter((h) => h.balance > 0));
  private readonly params = toSignal(this.route.paramMap);
  protected readonly facility = computed(() => this.camp.facility(this.params()?.get('facility')));
  protected readonly jobs = computed(() => {
    const facility = this.facility();
    return facility ? jobsAt(this.game.location(), facility.kind) : [];
  });

  constructor() {
    const router = inject(Router);
    effect(() => {
      if (this.params() && this.camp.facilities().length > 0 && !this.facility()) {
        void router.navigate(['../heroes-hall'], { relativeTo: this.route, replaceUrl: true });
      }
    });
  }
}
