import { Component, computed, inject, resource } from '@angular/core';

import { recentLine } from '../../adventure/replay-words';
import { Game } from '../../game';
import { BackLink } from '../../primitives/back-link';
import { ReplayList } from './replay-list';

/**
 * "Recently here", a secondary view behind the job board's "more" menu
 * (decision 0061), at `/camp/<location>/job-board/recent`: the adventures
 * recently settled at the location, anyone's, each opening its replay
 * (Issue-290, decision 0050), read when the view opens or the camp changes
 * and not after each of the player's own actions. It steps back to the
 * board.
 */
@Component({
  selector: 'heat-recent-panel',
  imports: [BackLink, ReplayList],
  templateUrl: './recent-panel.html',
  styleUrl: './panel.css',
})
export class RecentPanel {
  protected readonly game = inject(Game);
  private readonly recent = resource({ params: () => this.game.location(), loader: ({ params }) => this.game.recentAdventuresAt(params) });
  protected readonly lines = computed(() =>
    // A list read again for another location says Loading, not the last one's lines.
    this.recent.hasValue() && !this.recent.isLoading() ? this.recent.value().map(recentLine) : undefined,
  );
  protected readonly failed = computed(() => this.recent.status() === 'error');
}
