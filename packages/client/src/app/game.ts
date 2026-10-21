import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { STARTING_LOCATION } from '@heat/engine';
import { Api, ApiError } from './api';
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
}

export interface PlayerView {
  readonly id: string;
  readonly camps: readonly CampView[];
  readonly heroes: readonly HeroView[];
  readonly openAdventure: { readonly id: string; readonly startedAt: string } | null;
}

const HERO_FIELDS = 'id name unitType spriteSet location recruitedAt level xp status retiredAt';
const SEEN = `query($at: String!) { heroesSeenAt(location: $at) { id name unitType spriteSet level } }`;
const ME = `{ me { id camps { location name hallLevel heroCapacity activeHeroes livingHeroes } heroes { ${HERO_FIELDS} } openAdventure { id startedAt } } }`;

/**
 * The signed-in player's game: their camps, their heroes and the open
 * adventure, loaded from the hub after every sign-in, and the two things they
 * can do yet, recruit the free villager and retire a hero. Joining comes
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
