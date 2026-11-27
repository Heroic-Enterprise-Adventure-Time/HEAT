import { Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { FACILITIES } from '@heat/engine';

import { replayLine } from '../../adventure/replay-words';
import { Game } from '../../game';
import { BackLink } from '../../primitives/back-link';
import { CampState } from '../camp-state';
import { postedJob, posterOf } from './job-words';
import { ReplayList } from './replay-list';

/**
 * A job's replays, a secondary view behind the job's "more" menu (decision
 * 0061), at `<job>/replays` under the job's own address: anyone's, every
 * outcome, each opening its replay page, read when the view opens
 * (Issue-290, decision 0053). It steps back to the job.
 */
@Component({
  selector: 'heat-job-replays-panel',
  imports: [BackLink, ReplayList],
  templateUrl: './job-replays-panel.html',
  styleUrl: './panel.css',
})
export class JobReplaysPanel {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly poster = computed(() => posterOf(this.params()?.get('facility')));
  protected readonly posterName = computed(() => {
    const poster = this.poster();
    return poster ? FACILITIES[poster].name : 'Camp';
  });
  protected readonly job = computed(() => {
    const poster = this.poster();
    return postedJob(this.game.location(), poster, poster ? (this.camp.facility(poster)?.level ?? 0) : 0, this.params()?.get('job'));
  });
  private readonly replays = resource({ params: () => this.job()?.id, loader: ({ params }) => this.game.replaysOf(params) });
  protected readonly lines = computed(() =>
    // A list read again for another job says Loading, not the last job's lines.
    this.replays.hasValue() && !this.replays.isLoading() ? this.replays.value().flatMap((replay) => replayLine(replay) ?? []) : undefined,
  );
  protected readonly failed = computed(() => this.replays.status() === 'error');
}
