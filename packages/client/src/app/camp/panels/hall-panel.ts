import { Component, computed, inject, signal } from '@angular/core';

import { Game, type RecruitOffer, type RecruitRefusal } from '../../game';
import { refusalWords } from '../../hub';
import { HeroTile } from '../../primitives/hero-tile';
import { Icon } from '../../primitives/icon';
import { ResourceChip } from '../../primitives/resource-chip';
import { Slots } from '../../primitives/slots';
import { CampState } from '../camp-state';
import { FacilityBuild } from './facility-build';

/** The hub's refusals of a recruit, by type, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<RecruitRefusal, string>> = {
  HallLevel: 'The hall is not at the level this needs.',
  HallFull: 'The hall is full.',
  InsufficientResources: 'The camp cannot pay for this now.',
  Conflict: 'The camp changed while recruiting, and nobody was recruited. Try again.',
};

/**
 * The heroes hall's panel, `/camp/<location>/heroes-hall` (game.md, "The
 * heroes hall" and "The page"): the hall's count against its cap, as slot
 * circles (decision 0061); the roster as hero tiles, each a link to the
 * hero's card, grouped living, dead and retired, the retired collapsed, and at a
 * camp with nobody alive whose location offers no hero for nothing, why it
 * is empty and that a hero comes by caravan (Issue-352); the heroes on
 * their way by caravan, each holding a slot the count includes, so a hall
 * that looks to have room and refuses a recruit says why (Issue-355); every
 * unit type the location recruits, its price as resource chips that know
 * the camp's balance, and why it cannot be had now. A refusal from the hub is shown in place, on
 * the recruit it refused. Last, the hall's next level (Issue-93).
 */
@Component({
  selector: 'heat-hall-panel',
  imports: [FacilityBuild, HeroTile, Icon, ResourceChip, Slots],
  templateUrl: './hall-panel.html',
  styleUrl: './panel.css',
})
export class HallPanel {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);
  protected readonly dead = computed(() => this.game.heroesHere().filter((h) => h.status === 'DEAD'));
  /**
   * Why nobody is alive here and how a hero gets here, at a camp whose
   * location offers no hero for nothing (game.md, "The heroes hall"; decision
   * 0059): it comes by caravan. Null where the free villager answers the
   * same question, or while anyone is alive. A camp whose heroes are dead or
   * retired has had heroes, and is told of the next and not of a first.
   */
  protected readonly byCaravan = computed(() => {
    const camp = this.game.camp();
    if (!camp || !this.game.noFreeRecruit() || this.game.livingHere().length > 0) return null;
    return this.dead().length > 0 || this.game.retiredHere().length > 0
      ? `No living hero is here. Nobody at ${camp.name} joins for nothing: the next comes by caravan from another camp.`
      : `No hero is here yet. Nobody at ${camp.name} joins for nothing: its first hero comes by caravan from another camp.`;
  });
  /** The unit type being recruited while the hub answers; every recruit waits for it. */
  protected readonly pending = signal<string | null>(null);
  /** The hub's last refusal, on the recruit it refused; cleared by the next try. */
  protected readonly refused = signal<{ unitType: string; words: string } | null>(null);

  protected async recruit(offer: RecruitOffer): Promise<void> {
    this.refused.set(null);
    this.pending.set(offer.unitType);
    try {
      const hero = await this.game.recruit(offer.unitType);
      this.camp.arriving.set(hero.id);
    } catch (e) {
      this.refused.set({ unitType: offer.unitType, words: refusalWords(e, REFUSALS) });
    } finally {
      this.pending.set(null);
    }
  }
}
