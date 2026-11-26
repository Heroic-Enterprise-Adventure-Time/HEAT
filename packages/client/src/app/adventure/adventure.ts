import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { ABILITIES, type AbilityId, isPlayableTimeline, location, type PartyOrder, UNIT_PROFILES, type UnitType } from '@heat/engine';

import { cargoWords, stayedWords } from '../camp/panels/caravan-words';
import { rewardWords } from '../camp/panels/job-words';
import { groundAt } from '../camp/scene/layout';
import { Game } from '../game';
import { BattleView } from './battle-view';
import { jobCast, timelineCast } from './cast';
import { secondsLeft, waitingWords } from './field';
import { Play } from './play';
import { Playback } from './playback';
import { earnedWords, outcomeWords, stageResultWords } from './result-words';

/** What a result says while the player could not be read again after the run was sent. */
const UNREAD = 'Your camp could not be read again, so anything this run opened is not shown yet.';

/**
 * The open adventure, `/adventure` (Issue-15): the battle in the stage, and
 * in the content area beside it, below it on a narrow screen, the party and
 * the controls (game.md, "The page"): pause and the speeds, each hero's
 * abilities to force its next action, the party's orders, press on and
 * retreat, and in a stage's last ten seconds the time left before the party
 * turns back. When the run ends it is submitted, and the result takes the
 * controls' place, with each unlock the run earned that the player did not
 * hold (Issue-352), and for a caravan what became of its cargo and who
 * stayed (Issue-355), the replay, which plays the stored timeline in the
 * same scene with no engine, and Back to camp. With no adventure open and no
 * result to show, the address goes to the camp. The run waits for the scene
 * to load, and for the art of everyone this adventure sets against the party, so
 * that the party is seen running on from the start.
 */
@Component({
  selector: 'heat-adventure',
  imports: [BattleView, Playback],
  templateUrl: './adventure.html',
  styleUrl: './battle-panel.css',
  providers: [Play],
})
export class Adventure {
  protected readonly game = inject(Game);
  protected readonly play = inject(Play);
  private readonly router = inject(Router);
  protected readonly outcomeWords = outcomeWords;
  /** Each stage of the settled result in words, "fight: won". */
  protected readonly stages = computed(() => stageResultWords(this.game.settled()?.result?.stages ?? []));
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
    const stayed = stayedWords(caravan, settled.result, destination, (id) => this.heroName(id));
    const lines = [...cargoWords(caravan, settled.result, this.from(), destination), ...(stayed ? [stayed] : [])];
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
  /** The replay's timeline is being fetched, could not be, or was written before a change to the battle's events and is not played (decision 0051). */
  protected readonly replayState = signal<'idle' | 'loading' | 'failed' | 'unavailable'>('idle');

  protected readonly from = computed(() => {
    const at = (this.game.settled()?.adventure ?? this.game.adventure())?.location ?? '';
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

  /** Plays the stored timeline of the adventure just settled, read through the hub, in the same scene. */
  protected async replay(): Promise<void> {
    const settled = this.game.settled();
    if (!settled) return;
    this.replayState.set('loading');
    const timeline = await this.game.timeline(settled.adventure.id).catch(() => null);
    if (!timeline) {
      this.replayState.set('failed');
      return;
    }
    if (!isPlayableTimeline(timeline)) {
      this.replayState.set('unavailable');
      return;
    }
    this.replayState.set('idle');
    this.play.replay(timeline);
    this.view().reset(new Map(timeline.party.map((h) => [h.heroId, h.spriteSet])), timelineCast(timeline.events), groundAt(settled.adventure.location));
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

  /** The level a hero had when it set out, to say whether it gained one. */
  protected startLevel(heroId: string): number {
    return this.game.settled()?.adventure.snapshot.heroes.find((h) => h.heroId === heroId)?.level ?? 1;
  }

  /** Back to the camp the adventure left from, which the player was read again for; a reload waiting for this happens now. */
  protected async backToCamp(): Promise<void> {
    const at = this.game.settled()?.adventure.location ?? this.game.location();
    await this.router.navigate(['/camp', at]);
    this.game.settled.set(null);
  }
}
