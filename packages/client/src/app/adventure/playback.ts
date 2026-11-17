import { Component, computed, inject, input } from '@angular/core';

import { Play, SPEEDS } from './play';

/**
 * Pause and the speeds of a battle being played (decision 0002), the run's
 * or a replay's, with the `Play` its page provides; with `health`, each
 * hero's health under them, as a replay shows the party.
 */
@Component({
  selector: 'heat-playback',
  templateUrl: './playback.html',
  styleUrl: './battle-panel.css',
})
export class Playback {
  protected readonly play = inject(Play);
  readonly health = input(false);
  protected readonly speeds = SPEEDS;
  /** What the pause toggle does next. */
  protected readonly pauseLabel = computed(() => (this.play.paused() ? 'Resume' : 'Pause'));
}
