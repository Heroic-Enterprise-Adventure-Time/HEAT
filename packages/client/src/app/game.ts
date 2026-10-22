import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { STARTING_LOCATION, type AdventureLogEntry, type AdventureTimeline } from '@heat/engine';
import { Api, ApiError, PREVIOUS } from './api';
import { Session } from './session';

export interface HeroView {
  readonly id: string;
  readonly name: string;
  readonly unitType: string;
  readonly spriteSet: string;
  readonly location: string;
  readonly recruitedAt: string;
  readonly level: number;
  readonly xp: number;
  readonly status: 'ALIVE' | 'DEAD' | 'RETIRED';
  readonly retiredAt: string | null;
}

/** Another player's hero seen at the location: its public fields only, never whose it is (decision 0029). */
export interface SeenHeroView {
  readonly id: string;
  readonly name: string;
  readonly unitType: string;
  readonly spriteSet: string;
  readonly level: number;
}

export interface CampView {
  readonly location: string;
  readonly name: string;
  readonly hallLevel: number;
  readonly heroCapacity: number;
  readonly activeHeroes: number;
  readonly livingHeroes: number;
  /** The camp's stock; a resource it has none of may be missing. */
  readonly holdings: readonly { readonly material: string; readonly balance: number }[];
  /** The stock of each resource the warehouse holds at its level. */
  readonly resourceCapacity: number;
}

/** A hero as the adventure took it at the start, from the snapshot, with the numbers the engine runs it by. */
export interface PartyHeroView {
  readonly heroId: string;
  readonly name: string;
  readonly unitType: string;
  readonly spriteSet: string;
  readonly level: number;
  readonly stats: { readonly maxHealth: number; readonly speed: number; readonly damage: number; readonly gathering: number };
}

/**
 * The player's one open adventure: its job and its party (Issue-115), and
 * the seed and the snapshot the client plays it from (Issue-15).
 */
export interface AdventureView {
  readonly id: string;
  readonly startedAt: string;
  readonly location: string;
  readonly seed: string;
  /** The deploy that issued it, the only one that verifies it (decision 0030). */
  readonly version: string;
  readonly job: { readonly id: string; readonly name: string; readonly description: string };
  readonly snapshot: { readonly version: string; readonly jobId: string; readonly heroes: readonly PartyHeroView[] };
}

/** What the hub's replay found and settlement wrote (Issue-114). */
export interface AdventureResultView {
  readonly outcome: 'complete' | 'retreat' | 'defeat';
  readonly stages: readonly { readonly stage: number; readonly kind: string; readonly ended: string }[];
  readonly rewards: readonly { readonly material: string; readonly amount: number }[];
  readonly credited: readonly { readonly material: string; readonly amount: number }[];
  readonly lost: readonly { readonly material: string; readonly amount: number }[];
  readonly heroes: readonly { readonly heroId: string; readonly xpGained: number; readonly xp: number; readonly level: number; readonly dead: boolean }[];
}

/**
 * An adventure just ended, kept until the player leaves its result: the
 * result the hub answered, or null when no deploy could verify it any more
 * and it was discarded.
 */
export interface SettledView {
  readonly adventure: AdventureView;
  readonly result: AdventureResultView | null;
}

export interface PlayerView {
  readonly id: string;
  readonly camps: readonly CampView[];
  readonly heroes: readonly HeroView[];
  readonly openAdventure: AdventureView | null;
}

const HERO_FIELDS = 'id name unitType spriteSet location recruitedAt level xp status retiredAt';
const CAMP_FIELDS = 'location name hallLevel heroCapacity activeHeroes livingHeroes holdings { material balance } resourceCapacity';
const ADVENTURE_FIELDS =
  'id startedAt location seed version job { id name description } ' +
  'snapshot { version jobId heroes { heroId name unitType spriteSet level stats { maxHealth speed damage gathering } } }';
const RESULT_FIELDS =
  'outcome stages { stage kind ended } rewards { material amount } credited { material amount } lost { material amount } ' +
  'heroes { heroId xpGained xp level dead }';
const SEEN = `query($at: String!) { heroesSeenAt(location: $at) { id name unitType spriteSet level } }`;
const ME = `{ me { id camps { ${CAMP_FIELDS} } heroes { ${HERO_FIELDS} } openAdventure { ${ADVENTURE_FIELDS} } } }`;
const SUBMIT = `mutation($id: String!, $overrides: [OverrideInput!]!) { submitAdventure(adventureId: $id, overrides: $overrides) { result { ${RESULT_FIELDS} } } }`;
const TIMELINE = `query($id: String!) { adventure(id: $id) { timeline } }`;
const DISCARD = `mutation($id: String!) { discardAdventure(adventureId: $id) { id } }`;
const START = `mutation($at: String!, $job: String!, $heroes: [String!]!) { startAdventure(location: $at, jobId: $job, heroIds: $heroes) { ${ADVENTURE_FIELDS} } }`;

/**
 * The signed-in player's game: their camps, their heroes and the open
 * adventure, loaded from the hub after every sign-in, and the three things
 * they can do yet, recruit the free villager, retire a hero and start a job
 * from the job board. Joining comes
 * first, because the profile is made on first sign-in (joinGame, Issue-81).
 * Beside them, a few of other players' heroes seen at the camp's location,
 * read again when the player signs in or changes camps, not after each
 * change of their own, so the passers-by do not shuffle on every recruit.
 */
@Injectable({ providedIn: 'root' })
export class Game {
  private readonly api = inject(Api);
  private readonly session = inject(Session);

  readonly player = signal<PlayerView | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  /** The camp on screen; the header bar's select changes it. */
  readonly location = signal(STARTING_LOCATION);

  readonly camp = computed(() => this.player()?.camps.find((c) => c.location === this.location()) ?? null);
  /** The heroes the camp shows: the living and the dead, not the retired. */
  readonly heroesHere = computed(() =>
    (this.player()?.heroes ?? []).filter((h) => h.location === this.location() && h.status !== 'RETIRED'),
  );
  /** The camp's living heroes, the ones a party is picked from. */
  readonly livingHere = computed(() => this.heroesHere().filter((h) => h.status === 'ALIVE'));
  /** The player's one open adventure, or null. */
  readonly adventure = computed(() => this.player()?.openAdventure ?? null);
  /** The adventure just ended, while its result is on screen; the page does not reload under it (`Updates`). */
  readonly settled = signal<SettledView | null>(null);
  /** The camp's retired heroes, who stay on the record (game.md, "The heroes hall"). */
  readonly retiredHere = computed(() =>
    (this.player()?.heroes ?? []).filter((h) => h.location === this.location() && h.status === 'RETIRED'),
  );
  /** A few of other players' heroes seen at the camp's location, who walk about it for flavor. */
  readonly seenHere = signal<readonly SeenHeroView[]>([]);
  /** Whether the hall offers the free villager now, and if not, why not. */
  readonly freeVillager = computed((): { offered: boolean; reason: string | null } => {
    const camp = this.camp();
    if (!camp) return { offered: false, reason: null };
    if (camp.livingHeroes > 0) return { offered: false, reason: 'The villager is free only when no hero here is alive.' };
    if (camp.activeHeroes >= camp.heroCapacity) return { offered: false, reason: 'The hall is full.' };
    return { offered: true, reason: null };
  });

  constructor() {
    effect(() => {
      if (this.session.user()) void this.join();
      else this.player.set(null);
    });
    effect(() => {
      const signedIn = this.session.user() !== null;
      const location = this.location();
      untracked(() => {
        this.seenHere.set([]);
        if (signedIn) void this.loadSeen(location);
      });
    });
  }

  /** The sample is flavor: if it cannot be read, the camp shows no passers-by and says nothing. */
  async loadSeen(location: string): Promise<void> {
    try {
      const data = await this.api.request<{ heroesSeenAt: SeenHeroView[] }>(SEEN, { at: location });
      if (this.location() === location) this.seenHere.set(data.heroesSeenAt);
    } catch {
      // Left empty.
    }
  }

  async join(): Promise<void> {
    await this.run(async () => {
      await this.api.request('mutation { joinGame { id } }');
      await this.load();
    });
  }

  async load(): Promise<void> {
    const data = await this.api.request<{ me: PlayerView | null }>(ME);
    this.player.set(data.me);
  }

  /** Recruits the free villager; the hub draws its name and look. Answers the new hero. */
  async recruitVillager(): Promise<HeroView | null> {
    let hero: HeroView | null = null;
    await this.run(async () => {
      const data = await this.api.request<{ recruitHero: HeroView }>(
        `mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { ${HERO_FIELDS} } }`,
        { id: crypto.randomUUID() },
      );
      hero = data.recruitHero;
      await this.load();
    });
    return hero;
  }

  /** Retires a hero, alive or dead: permanent. Answers the hero as retired, or null if it failed. */
  async retire(heroId: string): Promise<HeroView | null> {
    let hero: HeroView | null = null;
    await this.run(async () => {
      const data = await this.api.request<{ retireHero: HeroView }>(
        `mutation($id: String!) { retireHero(heroId: $id) { ${HERO_FIELDS} } }`,
        { id: heroId },
      );
      hero = data.retireHero;
      await this.load();
    });
    return hero;
  }

  /**
   * Starts a job from the location's job board with a party of the player's
   * heroes there. Answers the open adventure, or throws the hub's refusal,
   * an `ApiError` with its code, for the job board to show in place. The
   * player is read again either way, since a refusal such as
   * `ADVENTURE_OPEN` means the view was stale.
   */
  async startAdventure(location: string, jobId: string, heroIds: readonly string[]): Promise<AdventureView> {
    this.busy.set(true);
    try {
      const data = await this.api.request<{ startAdventure: AdventureView }>(START, { at: location, job: jobId, heroes: heroIds });
      return data.startAdventure;
    } finally {
      // A failed read leaves the view as it was; the start's own answer is what matters here.
      await this.load().catch(() => undefined);
      this.busy.set(false);
    }
  }

  /**
   * Submits the adventure's override log and keeps what the hub answered in
   * `settled`, then reads the player again. An adventure another deploy
   * issued is refused with ENGINE_UPDATED, and goes to the deploy before,
   * `/previous/graphql`; refused there too, no deploy can verify it, so
   * it is discarded and the result is null (decision 0030). Any other
   * failure is thrown, and the log stays saved for another try.
   */
  async submitAdventure(adventure: AdventureView, log: readonly AdventureLogEntry[]): Promise<void> {
    const variables = { id: adventure.id, overrides: log.map(overrideInput) };
    let result: AdventureResultView | null = null;
    try {
      result = (await this.api.request<{ submitAdventure: { result: AdventureResultView } }>(SUBMIT, variables)).submitAdventure.result;
    } catch (e) {
      if (!engineUpdated(e)) throw e;
      try {
        result = (await this.api.request<{ submitAdventure: { result: AdventureResultView } }>(SUBMIT, variables, PREVIOUS)).submitAdventure.result;
      } catch (again) {
        if (!engineUpdated(again)) throw again;
        await this.api.request(DISCARD, { id: adventure.id });
      }
    }
    this.settled.set({ adventure, result });
    // A failed read leaves the view as it was; the result is what the player sees now.
    await this.load().catch(() => undefined);
  }

  /** The timeline the hub stored at settlement, for the replay: display only, played with no engine (decision 0030). */
  async timeline(adventureId: string): Promise<AdventureTimeline | null> {
    const data = await this.api.request<{ adventure: { timeline: AdventureTimeline | null } | null }>(TIMELINE, { id: adventureId });
    return data.adventure?.timeline ?? null;
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await work();
    } catch (e) {
      this.error.set(e instanceof ApiError || e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}

function engineUpdated(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'ENGINE_UPDATED';
}

/** The engine's log entry as the hub's flat `OverrideInput`. */
export function overrideInput(entry: AdventureLogEntry): Record<string, unknown> {
  return entry.kind === 'unit'
    ? { kind: 'UNIT', acceptedAtSimTime: entry.acceptedAtSimTime, unitId: entry.unitId, abilityId: entry.override.abilityId }
    : { kind: 'PARTY', acceptedAtSimTime: entry.acceptedAtSimTime, order: entry.order === 'retreat' ? 'RETREAT' : 'PRESS_ON' };
}
