import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FACILITIES } from '@heat/engine';

import { Game } from '../../game';
import { type MoreItem, MoreMenu } from '../../primitives/more-menu';
import { JobList } from './job-list';
import { jobsAt } from './job-words';

/**
 * The job board's panel, `/camp/<location>/job-board`: the jobs the
 * location's board posts, those that name no facility, each leading to its
 * detail, `/camp/<location>/job-board/jobs/<id>`, where a party sets out
 * (Issue-115, Issue-133). The adventures recently settled at the location
 * are behind the panel's "more" menu, at `job-board/recent` (`RecentPanel`;
 * decision 0061).
 */
@Component({
  selector: 'heat-job-board-panel',
  imports: [JobList, MoreMenu, RouterLink],
  templateUrl: './job-board-panel.html',
  styleUrl: './panel.css',
})
export class JobBoardPanel {
  protected readonly game = inject(Game);
  protected readonly description = FACILITIES['job-board'].description;
  protected readonly jobs = computed(() => jobsAt(this.game.location(), 'job-board'));
  /** The board's secondary views, behind its "more" menu (decision 0061). */
  protected readonly more: readonly MoreItem[] = [{ label: 'Recently here', to: 'recent' }];
}
