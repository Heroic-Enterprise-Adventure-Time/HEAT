import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Job } from '@heat/engine';

import { Game } from '../../game';
import { boardWords, lockedWords } from './job-words';

/**
 * The jobs a poster lists, the job board or a facility the camp has built
 * (Issue-115, Issue-133): each with its pay and its bonus XP, and nothing of
 * what it drops (decision 0058), linked to its detail under the poster's
 * panel, `<panel>/jobs/<id>`. A caravan to a location the player has not
 * unlocked is listed with the reason in place of its pay, not hidden
 * (Issue-355), and so is a job its facility's level does not post yet
 * (Issue-357).
 */
@Component({
  selector: 'heat-job-list',
  imports: [RouterLink],
  templateUrl: './job-list.html',
  styleUrl: './panel.css',
})
export class JobList {
  private readonly game = inject(Game);
  readonly jobs = input.required<readonly Job[]>();
  protected readonly pays = boardWords;
  /** Where the player has a camp, or null before the player is read, while no route is said to be locked. */
  private readonly campsAt = computed(() => this.game.player()?.camps.map((c) => c.location) ?? null);
  protected locked(job: Job): string | null {
    const campsAt = this.campsAt();
    const camp = this.game.camp();
    return camp ? lockedWords(job, campsAt, camp.facilities) : null;
  }
}
