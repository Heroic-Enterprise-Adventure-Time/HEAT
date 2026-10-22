import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FACILITIES } from '@heat/engine';
import { Game } from '../../game';
import { jobsAt, yieldWords } from './job-words';

/**
 * The job board's panel, `/camp/<location>/job-board`: the jobs the
 * location's board posts, each leading to its detail,
 * `/camp/<location>/job-board/jobs/<id>`, where a party sets out (Issue-115).
 */
@Component({
  selector: 'heat-job-board-panel',
  imports: [RouterLink],
  template: `
    <h2 id="panel-title">Job board</h2>
    <p>{{ description }}</p>
    @if (game.adventure(); as adventure) {
      <p class="note">An adventure is under way: <a class="link" routerLink="/adventure">{{ adventure.job.name }}</a>.</p>
    }
    @if (jobs().length > 0) {
      <ul class="jobs">
        @for (job of jobs(); track job.id) {
          <li>
            <a class="link" [routerLink]="['jobs', job.id]">{{ job.name }}</a>
            <span>{{ brings(job) }}</span>
          </li>
        }
      </ul>
    } @else {
      <p>No jobs are posted here.</p>
    }
  `,
  styleUrl: './panel.css',
})
export class JobBoardPanel {
  protected readonly game = inject(Game);
  protected readonly description = FACILITIES['job-board'].description;
  protected readonly jobs = computed(() => jobsAt(this.game.location()));
  protected readonly brings = yieldWords;
}
