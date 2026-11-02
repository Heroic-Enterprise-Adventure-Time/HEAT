import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Job } from '@heat/engine';
import { yieldWords } from './job-words';

/**
 * The jobs a poster lists, the job board or a facility the camp has built
 * (Issue-115, Issue-133): each with what it brings home, linked to its
 * detail under the poster's panel, `<panel>/jobs/<id>`.
 */
@Component({
  selector: 'heat-job-list',
  imports: [RouterLink],
  templateUrl: './job-list.html',
  styleUrl: './panel.css',
})
export class JobList {
  readonly jobs = input.required<readonly Job[]>();
  protected readonly brings = yieldWords;
}
