import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FACILITIES } from '@heat/engine';
import { Game } from '../../game';
import { JobList } from './job-list';
import { jobsAt } from './job-words';

/**
 * The job board's panel, `/camp/<location>/job-board`: the jobs the
 * location's board posts, those that name no facility, each leading to its
 * detail, `/camp/<location>/job-board/jobs/<id>`, where a party sets out
 * (Issue-115, Issue-133).
 */
@Component({
  selector: 'heat-job-board-panel',
  imports: [RouterLink, JobList],
  templateUrl: './job-board-panel.html',
  styleUrl: './panel.css',
})
export class JobBoardPanel {
  protected readonly game = inject(Game);
  protected readonly description = FACILITIES['job-board'].description;
  protected readonly jobs = computed(() => jobsAt(this.game.location(), 'job-board'));
}
