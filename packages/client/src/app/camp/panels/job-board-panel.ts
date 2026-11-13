import { Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FACILITIES } from '@heat/engine';

import { recentLine } from '../../adventure/replay-words';
import { Game } from '../../game';
import { JobList } from './job-list';
import { jobsAt } from './job-words';
import { ReplayList } from './replay-list';

/**
 * The job board's panel, `/camp/<location>/job-board`: the jobs the
 * location's board posts, those that name no facility, each leading to its
 * detail, `/camp/<location>/job-board/jobs/<id>`, where a party sets out
 * (Issue-115, Issue-133). Under them, the adventures recently settled at
 * the location, anyone's, each opening its replay (Issue-290, decision 0050),
 * read when the panel opens or the camp changes and not after each of the
 * player's own actions.
 */
@Component({
  selector: 'heat-job-board-panel',
  imports: [RouterLink, JobList, ReplayList],
  templateUrl: './job-board-panel.html',
  styleUrl: './panel.css',
})
export class JobBoardPanel {
  protected readonly game = inject(Game);
  protected readonly description = FACILITIES['job-board'].description;
  protected readonly jobs = computed(() => jobsAt(this.game.location(), 'job-board'));
  private readonly recent = resource({ params: () => this.game.location(), loader: ({ params }) => this.game.recentAdventuresAt(params) });
  protected readonly recentLines = computed(() =>
    // A list read again for another location says Loading, not the last one's lines.
    this.recent.hasValue() && !this.recent.isLoading() ? this.recent.value().map(recentLine) : undefined,
  );
  protected readonly recentFailed = computed(() => this.recent.status() === 'error');
}
