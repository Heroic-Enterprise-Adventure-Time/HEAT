import { computed, inject, type Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { FACILITIES, type Job } from '@heat/engine';

import { Game } from '../../game';
import { CampState } from '../camp-state';
import { postedJob, posterOf } from './job-words';

/** The job a panel's route names, and the name of the poster that lists it. */
export interface RoutedJob {
  /** The poster's name, the facility in the address or the job board, for the back link; "Camp" for an address that names no facility. */
  readonly posterName: Signal<string>;
  /** The job id as the address spells it, whether or not its poster posts it; null for an address that names none. */
  readonly jobId: Signal<string | null>;
  /** The job the address names under its poster, which posts it only once built; undefined for no such job. */
  readonly job: Signal<Job | undefined>;
}

/**
 * The job of the route a panel is shown at, `<poster>/jobs/<id>` or a child
 * of it, read the same way by the job's page and by its replays, so the two
 * never disagree on which job an address names (PR-392's review). Called in
 * an injection context, a component's field.
 */
export function injectRoutedJob(): RoutedJob {
  const game = inject(Game);
  const camp = inject(CampState);
  const params = toSignal(inject(ActivatedRoute).paramMap);
  const poster = computed(() => posterOf(params()?.get('facility')));
  const jobId = computed(() => params()?.get('job') ?? null);
  return {
    posterName: computed(() => {
      const kind = poster();
      return kind ? FACILITIES[kind].name : 'Camp';
    }),
    jobId,
    job: computed(() => {
      const kind = poster();
      return postedJob(game.location(), kind, kind ? (camp.facility(kind)?.level ?? 0) : 0, jobId());
    }),
  };
}
