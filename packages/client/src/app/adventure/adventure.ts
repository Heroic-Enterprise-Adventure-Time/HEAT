import { Component, computed, DestroyRef, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { ABILITIES, type AbilityId, location, type PartyOrder, UNIT_PROFILES, type UnitType } from '@heat/engine';

import { cargoWords, stayedWords } from '../camp/panels/caravan-words';
import { rewardWords } from '../camp/panels/job-words';
import { groundAt } from '../camp/scene/layout';
import { Game } from '../game';
import { Dialog } from '../primitives/dialog';
import { type GainedHero, Gains } from '../primitives/gains';
import { HeroTile, type TileHero } from '../primitives/hero-tile';
import { ResourceChip } from '../primitives/resource-chip';
import { BattleView } from './battle-view';
import { jobCast } from './cast';
import { secondsLeft, waitingWords } from './field';
import { Play } from './play';
import { Playback } from './playback';
import { earnedWords, resultTitle } from './result-words';

/** What a result says while the player could not be read again after the run was sent. */
const UNREAD = 'Your camp could not be read again, so anything this run opened is not shown yet.';

/**
 * The open adventure, `/adventure` (Issue-15): the battle in the stage, and
 * in the content area beside it, below it on a narrow screen, the party and
 * the controls (game.md, "The page"): pause and the speeds, each hero's
 * abilities to force its next action, the party's orders, press on and
 * retreat, and in a stage's last ten seconds the time left before the party
 * turns back. When the run ends it is submitted, and the result is a dialog
 * over the battle as it ended (Issue-441, decision 0065): how it ended as
 * its title, what came home and each hero's XP counted up, what a full
 * warehouse lost, each unlock the run earned that the player did not hold
 * (Issue-352), and for a caravan what became of its cargo, who stayed
 * (Issue-355) and who rode along (Issue-391). Its one button, OK, goes to
 * the camp the party left from, which leaves the result behind; the stages
 * and the replay are the replay's page's, behind the job's "Replays". With
 * no adventure open and no result to show, the address goes to the camp.
 * The run waits for the scene to load, and for the art of everyone this
 * adventure sets against the party, so that the party is seen running on
 * from the start.
 */
@Component({
  selector: 'heat-adventure',
  imports: [BattleView, Dialog, Gains, HeroTile, Playback, ResourceChip],
  templateUrl: './adventure.html',
  styleUrl: './battle-panel.css',
  providers: [Play],
})
export class Adventure {
  protected readonly game = inject(Game);
  protected readonly play = inject(Play);
  private readonly router = inject(Router);
  /**
   * The adventure the page shows: the open one, and once it has settled the
   * same one, so that the battle as it ended stays behind the result's
   * dialog, its controls unusable since the run is over.
   */
  protected readonly shown = computed(() => this.game.settled()?.adventure ?? this.game.adventure());
  /** Each hero's tile by id, from the snapshot the adventure set out with, at the level it set out at: a level gained is the result's to show. */
  protected readonly tiles = computed((): ReadonlyMap<string, TileHero> => new Map((this.shown()?.snapshot.heroes ?? []).map((h) => [h.heroId, h])));
  /** The title of the result's dialog: how the adventure ended, or that it was lost to a game update. */
  protected readonly title = computed(() => resultTitle(this.game.settled()?.result?.outcome ?? null));
  /**
   * What each hero of the party gained, in the order the result lists them:
   * the hero as it set out, from the snapshot, with the XP, the level and
   * the death the result gave it. A hero the snapshot does not hold is left
   * out, since nothing names it.
   */
  protected readonly gained = computed((): readonly GainedHero[] => {
    const settled = this.game.settled();
    const tiles = this.tiles();
    return (settled?.result?.heroes ?? []).flatMap((h) => {
      const hero = tiles.get(h.heroId);
      return hero ? [{ id: h.heroId, hero, xp: h.xpGained, level: h.level, died: h.dead }] : [];
    });
  });
  /**
   * What the player is told for each unlock this run earned that they did
   * not hold, in the content's words (game.md, "Unlocks"): those of the
   * player's own unlocks that name this adventure as the one that first
   * earned them, once the player has been read again after the submit
   * (decision 0059).
   */
  protected readonly unlocked = computed(() => {
    const settled = this.game.settled();
    return settled?.result ? earnedWords(this.game.player()?.unlocks ?? [], settled.adventure.id) : [];
  });
  /**
   * What a caravan's result says of its cargo and of who stays, one line for
   * each row of decision 0059's table, from what the caravan set out with
   * and the result's own delivered and lost (`cargoWords`, `stayedWords`);
   * null for a job that delivers nothing, or a caravan with nothing to say.
   */
  protected readonly caravan = computed(() => {
    const settled = this.game.settled();
    const caravan = settled?.adventure.caravan;
    if (!settled || !caravan) return null;
    const destination = location(caravan.destination)?.name ?? caravan.destination;
    const lines = [...cargoWords(caravan, settled.result, this.from(), destination), ...stayedWords(caravan, settled.result, this.from(), destination, (id) => this.heroName(id))];
    return lines.length > 0 ? lines : null;
  });
  /**
   * What the result says where the player could not be read again after the
   * submit: an unlock the run earned is told from that read alone, and it is
   * told once, here, so the page says that it does not know yet and offers
   * the read again (the review of PR-361).
   */
  protected readonly unread = computed(() => (this.game.error() === null ? null : UNREAD));
  /** Whether the player is being read again, from the result. */
  protected readonly reading = signal(false);

  private readonly view = viewChild.required(BattleView);
  private startedId: string | null = null;

  protected readonly from = computed(() => {
    const at = this.shown()?.location ?? '';
    return location(at)?.name ?? at;
  });
  protected readonly countdown = computed(() => {
    const field = this.play.field();
    return field ? secondsLeft(field, this.play.simTime()) : null;
  });
  /**
   * What has dropped to the party in words, "Carrying 34 timber, 22 ore", or
   * nothing while nothing has: it counts up the moment an enemy falls, which
   * is how the page shows a drop (the owner, 2026-11-20, Issue-339; the
   * scene's own picture of one is Issue-344). Its element is a live region
   * that is in the page from the start and empty until then, because one that
   * arrives already holding its words is not reliably spoken (the review of
   * PR-345).
   */
  protected readonly carrying = computed(() => {
    const drops = this.play.field()?.drops ?? [];
    return drops.length > 0 ? `Carrying ${drops.map(rewardWords).join(', ')}` : '';
  });
  /** Whether a hero can be told what to do: in a fight or a gather, before the end. */
  protected readonly inBattle = computed(() => {
    const field = this.play.field();
    return !!field && field.outcome === null && field.timeLimitMs !== null;
  });
  /** Why the ability buttons are disabled, shown beside them (angular.md, rule 14); null while they can be used. */
  protected readonly abilitiesWait = computed(() => {
    const field = this.play.field();
    return field ? waitingWords(field) : null;
  });
  /** The note's id while it shows, which describes each hero's ability buttons. */
  protected readonly abilitiesWaitId = computed(() => (this.abilitiesWait() ? 'abilities-wait' : null));

  constructor() {
    // The result is shown once: leaving it, by its dialog's button or any other way, puts it away, and the camp the player is read again for shows what it changed.
    inject(DestroyRef).onDestroy(() => { this.game.settled.set(null); });
    effect(() => {
      const adventure = this.game.adventure();
      if (!adventure || this.game.settled() || !this.view().ready() || this.startedId === adventure.id) return;
      untracked(() => {
        this.startedId = adventure.id;
        this.play.start(adventure);
        this.view().reset(new Map(adventure.snapshot.heroes.map((h) => [h.heroId, h.spriteSet])), jobCast(adventure.snapshot.jobId, adventure.seed), groundAt(adventure.location));
      });
    });
    effect(() => {
      // Only once the player is loaded: before then, no adventure means not read yet.
      if (this.game.player() && !this.game.adventure() && !this.game.settled()) {
        void this.router.navigate(['/camp', this.game.location()], { replaceUrl: true });
      }
    });
  }

  /** Reads the player again from the result, where the read after the submit failed. */
  protected async readAgain(): Promise<void> {
    this.reading.set(true);
    try {
      await this.game.reload();
    } finally {
      this.reading.set(false);
    }
  }

  /** The result's dialog was put away: to the camp the party left from, which leaves the result behind. */
  protected leave(): void {
    const settled = this.game.settled();
    if (settled) void this.router.navigate(['/camp', settled.adventure.location]);
  }

  /** A hero's abilities, from its unit type's one action list, as force buttons. */
  protected abilities(unitType: string): readonly { readonly id: string; readonly name: string }[] {
    return (UNIT_PROFILES[unitType as UnitType]?.actions ?? []).map((id) => ({ id, name: this.abilityName(id) }));
  }

  protected abilityName(id: string | undefined): string {
    return id && Object.hasOwn(ABILITIES, id) ? ABILITIES[id as AbilityId].name : (id ?? '');
  }

  protected order(order: PartyOrder): void {
    this.play.order(order);
  }

  protected heroName(heroId: string): string {
    return this.game.settled()?.adventure.snapshot.heroes.find((h) => h.heroId === heroId)?.name ?? heroId;
  }
}
