import { Component, computed, inject, input, signal } from '@angular/core';
import type { FacilityKind } from '@heat/engine';
import { ApiError } from '../../api';
import { Game, type UpgradeOffer } from '../../game';

/** The hub's refusals of a build, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<string, string>> = {
  MAX_LEVEL: 'This is already at its highest level here.',
  REQUIRES: 'The camp needs another facility built first.',
  INSUFFICIENT_RESOURCES: 'The camp cannot pay for this now.',
  CONFLICT: 'The camp changed while building, and nothing was built. Try again.',
};

/** A level's cost in words, each resource beside the camp's balance (game.md, "The page"). */
export function costWords(offer: UpgradeOffer): string {
  return offer.cost.map((c) => `${c.amount} ${c.material}, you have ${c.balance}`).join('; ');
}

/**
 * Building a facility or its next level, inside the facility's panel and the
 * hall's (Issue-93): what the level gives, its cost beside the camp's
 * balance, and the control, disabled with the reason when the camp cannot
 * build it. A refusal from the hub is shown in place. At the facility's
 * highest level here, it says so; before the camp is read, it shows nothing.
 */
@Component({
  selector: 'heat-facility-build',
  templateUrl: './facility-build.html',
  styleUrl: './panel.css',
})
export class FacilityBuild {
  readonly kind = input.required<FacilityKind>();
  protected readonly game = inject(Game);
  protected readonly offer = computed(() => this.game.upgrade(this.kind()));
  protected readonly cost = computed(() => {
    const offer = this.offer();
    return offer ? costWords(offer) : '';
  });
  /** The hub's last refusal; cleared by the next try. */
  protected readonly refused = signal<string | null>(null);

  protected async build(offer: UpgradeOffer): Promise<void> {
    this.refused.set(null);
    try {
      await this.game.build(offer.kind, offer.level);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      this.refused.set((code && REFUSALS[code]) ?? (e instanceof Error ? e.message : String(e)));
    }
  }
}
