import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { agoWords, partyWords, type ReplayLine } from '../../adventure/replay-words';
import { outcomeWords } from '../../adventure/result-words';

/** How many a list shows: the hub answers up to 20, and ten fit beside the scene (decision 0050). */
export const REPLAYS_SHOWN = 10;

/**
 * A list of settled adventures, each opening its replay page,
 * `/replays/<id>` (Issue-290): the job board's recent adventures, led by the
 * job, and a job's replays, led by when. Each says how it ended and its
 * party, never whose it was. It is named by the heading the panel gives it,
 * says "Loading…" until its read answers, and that it could not be read if
 * the read failed, which is no alert: the list is the panel's extra, and the
 * rest of the panel works without it.
 */
@Component({
  selector: 'heat-replay-list',
  imports: [RouterLink],
  templateUrl: './replay-list.html',
  styleUrl: './panel.css',
})
export class ReplayList {
  /** The lines, newest first, or undefined while the read is under way. */
  readonly lines = input.required<readonly ReplayLine[] | undefined>();
  readonly failed = input(false);
  /** The id of the heading that names the list. */
  readonly labelledBy = input.required<string>();
  /** Whether each line leads with its job, as on the job board, rather than with when. */
  readonly withJob = input(false);
  /** What the list says when it holds nothing. */
  readonly empty = input.required<string>();

  protected readonly rows = computed(() => {
    const lines = this.lines();
    if (!lines) return undefined;
    // When is read as the list is drawn; the list is read when the panel opens, so it does not tick.
    const now = Date.now();
    return lines.slice(0, REPLAYS_SHOWN).map((line) => {
      const when = agoWords(line.settledAt, now);
      const outcome = outcomeWords(line.outcome);
      const link = this.withJob() ? line.job : when;
      const says = this.withJob() ? `${outcome}, ${when}.` : `${outcome}.`;
      return {
        id: line.id,
        link,
        // The link is named with how it ended too, so two settled in the same hour, or of one job, are told apart.
        label: `${link}: ${says}`,
        says,
        party: `${partyWords(line.party)}.`,
      };
    });
  });
}
