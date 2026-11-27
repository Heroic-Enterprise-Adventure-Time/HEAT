import { Component, computed, inject, resource } from '@angular/core';

import { replayLine } from '../../adventure/replay-words';
import { Game } from '../../game';
import { BackLink } from '../../primitives/back-link';
import { ReplayList } from './replay-list';
import { injectRoutedJob } from './routed-job';

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
  private readonly routed = injectRoutedJob();
  protected readonly posterName = this.routed.posterName;
  protected readonly job = this.routed.job;
  private readonly replays = resource({ params: () => this.job()?.id, loader: ({ params }) => this.game.replaysOf(params) });
  protected readonly lines = computed(() =>
    // A list read again for another job says Loading, not the last job's lines.
    this.replays.hasValue() && !this.replays.isLoading() ? this.replays.value().flatMap((replay) => replayLine(replay) ?? []) : undefined,
  );
  protected readonly failed = computed(() => this.replays.status() === 'error');
}
