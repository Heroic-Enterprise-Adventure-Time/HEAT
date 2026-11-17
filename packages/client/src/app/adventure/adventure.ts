import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { ABILITIES, type AbilityId, isPlayableTimeline, type JobId, JOBS, location, type PartyOrder, UNIT_PROFILES, type UnitType } from '@heat/engine';

import { stageWords } from '../camp/panels/job-words';
import { Game } from '../game';
import { BattleView } from './battle-view';
import { secondsLeft, waitingWords } from './field';
import { Play } from './play';
import { Playback } from './playback';
import { outcomeWords, stageResultWords } from './result-words';

/**
 * The open adventure, `/adventure` (Issue-15): the battle in the stage, and
 * in the content area beside it, below it on a narrow screen, the party and
 * the controls (game.md, "The page"): pause and the speeds, each hero's
 * abilities to force its next action, the party's orders, press on and
 * retreat, and in a stage's last ten seconds the time left before the party
 * turns back. When the run ends it is submitted, and the result takes the
 * controls' place, with the replay, which plays the stored timeline in the
 * same scene with no engine, and Back to camp. With no adventure open and no
 * result to show, the address goes to the camp. The run waits for the scene
 * to load, so that the party can run on from the start.
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

  private readonly view = viewChild.required(BattleView);
  private startedId: string | null = null;
  /** The replay's timeline is being fetched, could not be, or was written before a change to the battle's events and is not played (decision 0051). */
  protected readonly replayState = signal<'idle' | 'loading' | 'failed' | 'unavailable'>('idle');

  protected readonly from = computed(() => {
    const at = (this.game.settled()?.adventure ?? this.game.adventure())?.location ?? '';
    return location(at)?.name ?? at;
  });
  /** The stage under way in words, "Stage 2 of 3: Fight 2 wolves". */
  protected readonly stageName = computed(() => {
    const field = this.play.field();
    const jobId = this.game.adventure()?.snapshot.jobId;
    const job = jobId && Object.hasOwn(JOBS, jobId) ? JOBS[jobId as JobId] : undefined;
    const stage = field && job?.stages[field.stage];
    return field && job && stage ? `Stage ${field.stage + 1} of ${job.stages.length}: ${stageWords(stage)}` : null;
  });
  protected readonly countdown = computed(() => {
    const field = this.play.field();
    return field ? secondsLeft(field, this.play.simTime()) : null;
  });
  /** What the party carries in words, "5 timber, 3 ore", or null when it carries nothing. */
  protected readonly cargo = computed(() => {
    const cargo = this.play.field()?.cargo ?? [];
    return cargo.length > 0 ? cargo.map((load) => `${load.amount} ${load.material}`).join(', ') : null;
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
        this.view().reset(new Map(adventure.snapshot.heroes.map((h) => [h.heroId, h.spriteSet])));
      });
    });
    effect(() => {
      // Only once the player is loaded: before then, no adventure means not read yet.
      if (this.game.player() && !this.game.adventure() && !this.game.settled()) {
        void this.router.navigate(['/camp', this.game.location()], { replaceUrl: true });
      }
    });
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
    this.view().reset(new Map(timeline.party.map((h) => [h.heroId, h.spriteSet])));
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
