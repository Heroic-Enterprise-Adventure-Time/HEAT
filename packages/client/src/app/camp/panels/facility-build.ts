import { Component, computed, inject, input, signal } from '@angular/core';

import type { FacilityKind } from '@heat/engine';

import { type BuildRefusal, Game, type UpgradeOffer } from '../../game';
import { refusalWords } from '../../hub';

/** The hub's refusals of a build, by type, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<BuildRefusal, string>> = {
  MaxLevel: 'This is already at its highest level here.',
  Requires: 'The camp needs another facility built first.',
  InsufficientResources: 'The camp cannot pay for this now.',
  Conflict: 'The camp changed while building, and nothing was built. Try again.',
};

/** A cost in words, each resource beside the camp's balance (game.md, "The page"): a facility's level here, a recruit's price in the hall. */
export function costWords(cost: UpgradeOffer['cost']): string {
  return cost.map((c) => `${c.amount} ${c.material}, you have ${c.balance}`).join('; ');
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
  protected readonly game = inject(Game);
  readonly kind = input.required<FacilityKind>();
  protected readonly offer = computed(() => this.game.upgrade(this.kind()));
  protected readonly cost = computed(() => {
    const offer = this.offer();
    return offer ? costWords(offer.cost) : '';
  });
  /** Whether a build is under way, while the hub answers. */
  protected readonly pending = signal(false);
  /** The hub's last refusal; cleared by the next try. */
  protected readonly refused = signal<string | null>(null);

  protected async build(offer: UpgradeOffer): Promise<void> {
    this.refused.set(null);
    this.pending.set(true);
    try {
      await this.game.build(offer.kind, offer.level);
    } catch (e) {
      this.refused.set(refusalWords(e, REFUSALS));
    } finally {
      this.pending.set(false);
    }
  }
}
