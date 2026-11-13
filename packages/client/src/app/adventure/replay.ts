import { Component, computed, effect, inject, resource, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { type AdventureTimeline, isPlayableTimeline, location } from '@heat/engine';

import { Game } from '../game';
import { BattleView } from './battle-view';
import { Play } from './play';
import { Playback } from './playback';
import { agoWords, partyWords, replayLine } from './replay-words';
import { outcomeWords, stageResultWords } from './result-words';

/** Where the replay page stands: reading, nothing to replay, the read failed, written before the battles changed, or playing. */
type ReplayState = 'loading' | 'missing' | 'failed' | 'unavailable' | 'playing';

/**
 * Any settled adventure's replay, `/replays/<id>` (Issue-290; game.md, "The
 * page"): its stored timeline played in the battle scene, with no engine and
 * the same pause and speeds as the player's own replay (decision 0030), and
 * beside it the job, where and when, how it ended, its stages and its party,
 * never whose it was. It plays as soon as the scene is up, and again from the
 * start on asking. A timeline written under an older schema is not played,
 * and the page says the replay is unavailable (decision 0051); an id that is
 * no settled adventure is no replay.
 */
@Component({
  selector: 'heat-replay',
  imports: [BattleView, Playback, RouterLink],
  templateUrl: './replay.html',
  styleUrl: './battle-panel.css',
  providers: [Play],
})
export class Replay {
  private readonly game = inject(Game);
  private readonly play = inject(Play);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  private readonly view = viewChild.required(BattleView);

  private readonly read = resource({ params: () => this.params()?.get('id') ?? undefined, loader: ({ params }) => this.game.replay(params) });
  /** The settled adventure read, or null while reading, when there is none, or when the read failed. */
  protected readonly adventure = computed(() => {
    const read = this.read.hasValue() ? this.read.value() : null;
    return read?.status === 'SETTLED' ? read : null;
  });
  protected readonly state = computed((): ReplayState => {
    if (this.read.status() === 'error') return 'failed';
    if (this.read.isLoading()) return 'loading';
    const adventure = this.adventure();
    if (!adventure) return 'missing';
    return adventure.timeline && isPlayableTimeline(adventure.timeline) ? 'playing' : 'unavailable';
  });
  /** The timeline to play, once it is read and playable. */
  private readonly timeline = computed((): AdventureTimeline | null => (this.state() === 'playing' ? this.adventure()?.timeline ?? null : null));

  protected readonly from = computed(() => {
    const at = this.adventure()?.location ?? this.game.location();
    return { id: at, name: location(at)?.name ?? at };
  });
  /** Where and when, "At Millbrook, 3 hours ago." */
  protected readonly whereWhen = computed(() => {
    const settledAt = this.adventure()?.settledAt;
    return settledAt ? `At ${this.from().name}, ${agoWords(settledAt, Date.now())}.` : `At ${this.from().name}.`;
  });
  protected readonly outcome = computed(() => {
    const outcome = this.adventure()?.result?.outcome;
    return outcome ? `${outcomeWords(outcome)}.` : null;
  });
  protected readonly stages = computed(() => stageResultWords(this.adventure()?.result?.stages ?? []));
  protected readonly party = computed(() => {
    const adventure = this.adventure();
    const line = adventure && replayLine(adventure);
    return line ? `${partyWords(line.party)}.` : null;
  });

  constructor() {
    let started: AdventureTimeline | null = null;
    effect(() => {
      const timeline = this.timeline();
      if (!timeline || !this.view().ready() || started === timeline) return;
      untracked(() => {
        started = timeline;
        this.start(timeline);
      });
    });
  }

  /** Plays the replay again from its start. */
  protected watchAgain(): void {
    const timeline = this.timeline();
    if (timeline) this.start(timeline);
  }

  private start(timeline: AdventureTimeline): void {
    this.play.replay(timeline);
    this.view().reset(new Map(timeline.party.map((h) => [h.heroId, h.spriteSet])));
  }
}
