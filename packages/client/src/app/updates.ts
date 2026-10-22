import { Injectable, InjectionToken, effect, inject, untracked } from '@angular/core';
import { Api } from './api';
import { Config } from './config';
import { Game } from './game';

/** Reloads the page; a test provides one that counts. */
export const RELOAD = new InjectionToken<() => void>('heat.reload', {
  providedIn: 'root',
  factory: () => () => window.location.reload(),
});

/** The version this tab last reloaded away from, in session storage. */
export const RELOADED_FROM = 'heat.reloadedFrom';

/**
 * Loads a newer deploy when the hub says this client is outdated (decision
 * 0030): at once if no adventure is open, and otherwise once it has closed
 * and the player has left its result (Issue-15), so a player mid-adventure
 * finishes on the client they loaded, submits to the previous route and
 * reads the result. The owner's call on Issue-115: a reload, not a prompt.
 *
 * A tab reloads away from a version once. If the page it gets is still
 * outdated, as when `config.json` and the hub are briefly out of step during
 * a deploy, it stays as it is rather than reloading in a loop; the next load
 * by any other means picks the deploy up.
 */
@Injectable({ providedIn: 'root' })
export class Updates {
  private readonly api = inject(Api);
  private readonly config = inject(Config);
  private readonly game = inject(Game);
  private readonly reload = inject(RELOAD);

  constructor() {
    effect(() => {
      if (!this.api.outdated()) return;
      const player = this.game.player();
      // Before the player is read, an open adventure cannot be ruled out.
      if (!player || player.openAdventure || this.game.settled()) return;
      const version = this.config.value()?.version;
      if (!version) return;
      untracked(() => this.reloadOnce(version));
    });
  }

  private reloadOnce(version: string): void {
    try {
      if (sessionStorage.getItem(RELOADED_FROM) === version) return;
      sessionStorage.setItem(RELOADED_FROM, version);
    } catch {
      // Without storage there is no loop guard, so no reload.
      return;
    }
    this.reload();
  }
}
