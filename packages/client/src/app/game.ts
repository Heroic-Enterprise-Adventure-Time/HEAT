import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  ADVENTURE_OUTCOMES,
  FACILITY_KINDS,
  MATERIALS,
  STAGE_ENDINGS,
  STAGE_KINDS,
  STARTING_LOCATION,
  UNIT_TYPES,
  buildRefusal,
  hallCapacity,
  location,
  must,
  nextLevel,
  recruitCost,
  warehouseCapacity,
  type AdventureLogEntry,
  type AdventureTimeline,
  type FacilityKind,
  type UnitType,
} from '@heat/engine';
import { constantCase } from 'es-toolkit';
import { Api, ApiError, PREVIOUS, Refusal, type Route } from './api';
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
  readonly warehouseLevel: number;
  readonly heroCapacity: number;
  readonly activeHeroes: number;
  readonly livingHeroes: number;
  /** The camp's stock; a resource it has none of may be missing. */
  readonly holdings: readonly { readonly material: string; readonly balance: number }[];
  /** The stock of each resource the warehouse holds at its level. */
  readonly resourceCapacity: number;
  /** Each of the camp's own facilities and its level, 0 for one not built (Issue-93). */
  readonly facilities: readonly { readonly kind: FacilityKind; readonly level: number }[];
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

/**
 * A view as the hub answers it: the same shape, every string widened, because
 * the engine's closed sets travel as the schema's UPPER_CASE enum values
 * (`VILLAGER`, `TIMBER`, `HEROES_HALL`) and are read back into the engine's
 * own values at this boundary (docs/standards/graphql.md, rule 4). Nothing
 * past this file sees a wire value.
 */
type Wire<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Wire<U>[]
    : T extends object
      ? { readonly [K in keyof T]: Wire<T[K]> }
      : T;

/** The engine's value behind a schema enum name: `VILLAGER` is the engine's `villager`. */
function engineValue<T extends string>(values: readonly T[], name: string): T {
  return must(values.find((value) => constantCase(value) === name), `an engine value for ${name}`);
}

/** The schema's enum name of an engine value: `heroes-hall` is sent as `HEROES_HALL`. */
export function wireValue(value: string): string {
  return constantCase(value);
}

const unitType = (name: string): UnitType => engineValue(UNIT_TYPES, name);
const material = (name: string) => engineValue(MATERIALS, name);
const materials = <T extends { readonly material: string }>(items: readonly T[]) => items.map((item) => ({ ...item, material: material(item.material) }));

function heroFromWire(hero: Wire<HeroView>): HeroView {
  return { ...hero, unitType: unitType(hero.unitType), status: hero.status as HeroView['status'] };
}

function campFromWire(camp: Wire<CampView>): CampView {
  return {
    ...camp,
    holdings: materials(camp.holdings),
    facilities: camp.facilities.map((f) => ({ ...f, kind: engineValue(FACILITY_KINDS, f.kind) })),
  };
}

function adventureFromWire(adventure: Wire<AdventureView>): AdventureView {
  return {
    ...adventure,
    snapshot: { ...adventure.snapshot, heroes: adventure.snapshot.heroes.map((h) => ({ ...h, unitType: unitType(h.unitType) })) },
  };
}

function resultFromWire(result: Wire<AdventureResultView>): AdventureResultView {
  return {
    ...result,
    outcome: engineValue(ADVENTURE_OUTCOMES, result.outcome),
    stages: result.stages.map((s) => ({ ...s, kind: engineValue(STAGE_KINDS, s.kind), ended: engineValue(STAGE_ENDINGS, s.ended) })),
    rewards: materials(result.rewards),
    credited: materials(result.credited),
    lost: materials(result.lost),
  };
}

function playerFromWire(player: Wire<PlayerView>): PlayerView {
  return {
    ...player,
    camps: player.camps.map(campFromWire),
    heroes: player.heroes.map(heroFromWire),
    openAdventure: player.openAdventure ? adventureFromWire(player.openAdventure) : null,
  };
}

/**
 * A mutation's result union as the client selects it: the type's name, the
 * success's one field when the mutation did its work, and the refusal's
 * message otherwise (graphql.md, rule 6).
 */
type Answer<K extends string, T> = { readonly __typename: string; readonly message?: string } & Partial<Record<K, T>>;

/** The success's field, or the refusal thrown as a `Refusal` named by its type, for the panel that asked to show. */
function answered<K extends string, T>(answer: Answer<K, T>, success: string, field: K): T {
  const fields: Partial<Record<K, T>> = answer;
  if (answer.__typename === success) return must<T>(fields[field], `${success}.${field}`);
  throw new Refusal(answer.__typename, answer.message ?? answer.__typename);
}

const HERO_FIELDS = 'id name unitType spriteSet location recruitedAt level xp status retiredAt';
const CAMP_FIELDS =
  'location name hallLevel warehouseLevel heroCapacity activeHeroes livingHeroes holdings { material balance } resourceCapacity facilities { kind level }';
const ADVENTURE_FIELDS =
  'id startedAt location seed version job { id name description } ' +
  'snapshot { version jobId heroes { heroId name unitType spriteSet level stats { maxHealth speed damage gathering } } }';
const RESULT_FIELDS =
  'outcome stages { stage kind ended } rewards { material amount } credited { material amount } lost { material amount } ' +
  'heroes { heroId xpGained xp level dead }';
const REFUSAL_FIELDS = '__typename ... on Error { message }';
const SEEN = `query($at: ID!) { heroesSeenAt(location: $at) { id name unitType spriteSet level } }`;
const ME = `{ me { id camps { ${CAMP_FIELDS} } heroes { ${HERO_FIELDS} } openAdventure { ${ADVENTURE_FIELDS} } } }`;
const JOIN = `mutation { joinGame { ${REFUSAL_FIELDS} ... on JoinGameSuccess { player { id } } } }`;
const SUBMIT = `mutation($input: SubmitAdventureInput!) { submitAdventure(input: $input) { ${REFUSAL_FIELDS} ... on SubmitAdventureSuccess { adventure { result { ${RESULT_FIELDS} } } } } }`;
const TIMELINE = `query($id: ID!) { adventure(id: $id) { timeline } }`;
const DISCARD = `mutation($input: DiscardAdventureInput!) { discardAdventure(input: $input) { ${REFUSAL_FIELDS} ... on DiscardAdventureSuccess { adventure { id } } } }`;
const START = `mutation($input: StartAdventureInput!) { startAdventure(input: $input) { ${REFUSAL_FIELDS} ... on StartAdventureSuccess { adventure { ${ADVENTURE_FIELDS} } } } }`;
const BUILD = `mutation($input: BuildFacilityInput!) { buildFacility(input: $input) { ${REFUSAL_FIELDS} ... on BuildFacilitySuccess { camp { location } } } }`;
const RECRUIT = `mutation($input: RecruitHeroInput!) { recruitHero(input: $input) { ${REFUSAL_FIELDS} ... on RecruitHeroSuccess { hero { ${HERO_FIELDS} } } } }`;
const RETIRE = `mutation($input: RetireHeroInput!) { retireHero(input: $input) { ${REFUSAL_FIELDS} ... on RetireHeroSuccess { hero { ${HERO_FIELDS} } } } }`;

/** A unit type the hall recruits, its price to the camp, and why it cannot be had now, or null when it can. */
export interface RecruitOffer {
  readonly unitType: UnitType;
  /** Each resource of the price beside the camp's balance of it; empty for the free villager. */
  readonly cost: readonly { readonly material: string; readonly amount: number; readonly balance: number }[];
  readonly reason: string | null;
}

/**
 * The next level of a facility the camp can build, what it gives, its cost
 * beside the camp's balance, and why it cannot be built now, or null when it
 * can (Issue-93).
 */
export interface UpgradeOffer {
  readonly kind: FacilityKind;
  readonly level: number;
  /** What the level changes, in words, where it changes a number; null for a facility's first level. */
  readonly gives: string | null;
  readonly cost: readonly { readonly material: string; readonly amount: number; readonly balance: number }[];
  readonly reason: string | null;
}

/**
 * The next level of one of a camp's own facilities, by the hub's rules
 * (`buildRefusal`, which the hub checks too), or null at its highest.
 */
export function upgradeOffer(camp: CampView, kind: FacilityKind): UpgradeOffer | null {
  const levels = Object.fromEntries(camp.facilities.map((f) => [f.kind, f.level]));
  const next = nextLevel(kind, levels[kind] ?? 0);
  if (!next) return null;
  const cost = next.cost.map(({ material, amount }) => ({
    material,
    amount,
    balance: camp.holdings.find((h) => h.material === material)?.balance ?? 0,
  }));
  const gives =
    kind === 'heroes-hall'
      ? `Holds ${hallCapacity(next.level)} heroes.`
      : kind === 'warehouse'
        ? `Holds ${warehouseCapacity(next.level)} of each resource.`
        : null;
  const refusal = buildRefusal({ levels, holdings: camp.holdings }, kind);
  const reason =
    refusal?.code === 'INSUFFICIENT_RESOURCES' ? `Not enough ${refusal.short.map((s) => s.material).join(' or ')}.` : (refusal?.message ?? null);
  return { kind, level: next.level, gives, cost, reason };
}

/**
 * The signed-in player's game: their camps, their heroes and the open
 * adventure, loaded from the hub after every sign-in, and what
 * they can do yet: recruit a hero, retire one, build a facility and start a job
 * from the job board. Joining comes
 * first, because the profile is made on first sign-in (joinGame, Issue-81).
 * Beside them, a few of other players' heroes seen at the camp's location,
 * read again when the player signs in or changes camps, not after each
 * change of their own, so the passers-by do not shuffle on every recruit.
 *
 * Every mutation sends one input object and answers a result union; a
 * refusal is a member of the union, thrown here as a `Refusal` named by its
 * type for the panel to show in place (graphql.md, rules 5 and 6).
 */
@Service()
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
  /**
   * What the hall offers: each unit type on the location's list, its price
   * to this camp beside the camp's balance, and why it cannot be had now,
   * by the hub's rules in the hub's order (`packages/hub/src/recruit.ts`).
   */
  readonly recruits = computed((): readonly RecruitOffer[] => {
    const camp = this.camp();
    const at = location(this.location());
    if (!camp || !at) return [];
    return at.recruits.map((recruit) => {
      const cost = recruitCost(recruit, camp.livingHeroes).map(({ material, amount }) => ({
        material,
        amount,
        balance: camp.holdings.find((h) => h.material === material)?.balance ?? 0,
      }));
      const short = cost.filter((c) => c.balance < c.amount).map((c) => c.material);
      const reason =
        camp.hallLevel < recruit.hallLevel
          ? `Needs a level ${recruit.hallLevel} hall.`
          : camp.activeHeroes >= camp.heroCapacity
            ? 'The hall is full.'
            : short.length > 0
              ? `Not enough ${short.join(' or ')}.`
              : null;
      return { unitType: recruit.unitType, cost, reason };
    });
  });

  /** The next level of one of the camp on screen's own facilities, or null at its highest (`upgradeOffer`). */
  upgrade(kind: FacilityKind): UpgradeOffer | null {
    const camp = this.camp();
    return camp && upgradeOffer(camp, kind);
  }

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
      const data = await this.api.request<{ heroesSeenAt: readonly Wire<SeenHeroView>[] | null }>(SEEN, { at: location });
      if (this.location() === location) this.seenHere.set((data.heroesSeenAt ?? []).map((h) => ({ ...h, unitType: unitType(h.unitType) })));
    } catch {
      // Left empty.
    }
  }

  async join(): Promise<void> {
    await this.run(async () => {
      const data = await this.api.request<{ joinGame: Answer<'player', { id: string }> }>(JOIN);
      answered(data.joinGame, 'JoinGameSuccess', 'player');
      await this.load();
    });
  }

  async load(): Promise<void> {
    const data = await this.api.request<{ me: Wire<PlayerView> | null }>(ME);
    this.player.set(data.me ? playerFromWire(data.me) : null);
  }

  /**
   * Recruits a hero of the unit type, with a fresh request id; the hub
   * draws its name and look, and debits its cost. Answers the new hero, or
   * throws the hub's refusal, a `Refusal` named by its type, for the hall to
   * show in place. The player is read again either way, since a refusal
   * such as `HallFull` means the view was stale.
   */
  async recruit(unitType: UnitType): Promise<HeroView> {
    this.busy.set(true);
    try {
      const input = { unitType: wireValue(unitType), requestId: crypto.randomUUID() };
      const data = await this.api.request<{ recruitHero: Answer<'hero', Wire<HeroView>> }>(RECRUIT, { input });
      return heroFromWire(answered(data.recruitHero, 'RecruitHeroSuccess', 'hero'));
    } finally {
      // A failed read leaves the view as it was; the recruit's own answer is what matters here.
      await this.load().catch(() => undefined);
      this.busy.set(false);
    }
  }

  /**
   * Builds the facility's next level at the camp on screen. Answers when it
   * is built, or throws the hub's refusal, a `Refusal` named by its type, for
   * the panel to show in place. The player is read again either way, since
   * a refusal means the view was stale.
   */
  async build(kind: FacilityKind, level: number): Promise<void> {
    this.busy.set(true);
    try {
      const input = { location: this.location(), kind: wireValue(kind), level };
      const data = await this.api.request<{ buildFacility: Answer<'camp', { location: string }> }>(BUILD, { input });
      answered(data.buildFacility, 'BuildFacilitySuccess', 'camp');
    } finally {
      // A failed read leaves the view as it was; the build's own answer is what matters here.
      await this.load().catch(() => undefined);
      this.busy.set(false);
    }
  }

  /** Retires a hero, alive or dead: permanent. Answers the hero as retired, or null if it failed. */
  async retire(heroId: string): Promise<HeroView | null> {
    let hero: HeroView | null = null;
    await this.run(async () => {
      const data = await this.api.request<{ retireHero: Answer<'hero', Wire<HeroView>> }>(RETIRE, { input: { heroId } });
      hero = heroFromWire(answered(data.retireHero, 'RetireHeroSuccess', 'hero'));
      await this.load();
    });
    return hero;
  }

  /**
   * Starts a job from the location's job board with a party of the player's
   * heroes there. Answers the open adventure, or throws the hub's refusal,
   * a `Refusal` named by its type, for the job board to show in place. The
   * player is read again either way, since a refusal such as
   * `AdventureOpen` means the view was stale.
   */
  async startAdventure(location: string, jobId: string, heroIds: readonly string[]): Promise<AdventureView> {
    this.busy.set(true);
    try {
      const input = { location, jobId, heroIds };
      const data = await this.api.request<{ startAdventure: Answer<'adventure', Wire<AdventureView>> }>(START, { input });
      return adventureFromWire(answered(data.startAdventure, 'StartAdventureSuccess', 'adventure'));
    } finally {
      // A failed read leaves the view as it was; the start's own answer is what matters here.
      await this.load().catch(() => undefined);
      this.busy.set(false);
    }
  }

  /**
   * Submits the adventure's override log and keeps what the hub answered in
   * `settled`, then reads the player again. An adventure another deploy
   * issued is refused with EngineUpdated, and goes to the deploy before,
   * `/previous/graphql`; refused there too, no deploy can verify it, so
   * it is discarded and the result is null (decision 0030). Any other
   * refusal or failure is thrown, and the log stays saved for another try.
   */
  async submitAdventure(adventure: AdventureView, log: readonly AdventureLogEntry[]): Promise<void> {
    const input = { adventureId: adventure.id, overrides: log.map(overrideInput) };
    const submit = async (route: Route) =>
      (await this.api.request<{ submitAdventure: Answer<'adventure', { result: Wire<AdventureResultView> | null }> }>(SUBMIT, { input }, route))
        .submitAdventure;
    let result: AdventureResultView | null = null;
    let answer = await submit('current');
    if (answer.__typename === 'EngineUpdated') answer = await submit(PREVIOUS);
    if (answer.__typename === 'EngineUpdated') {
      const data = await this.api.request<{ discardAdventure: Answer<'adventure', { id: string }> }>(DISCARD, { input: { adventureId: adventure.id } });
      answered(data.discardAdventure, 'DiscardAdventureSuccess', 'adventure');
    } else {
      result = resultFromWire(must(answered(answer, 'SubmitAdventureSuccess', 'adventure').result, 'the settled result'));
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

/** The engine's log entry as the hub's flat `OverrideInput`. */
export function overrideInput(entry: AdventureLogEntry): Record<string, unknown> {
  return entry.kind === 'unit'
    ? { kind: 'UNIT', acceptedAtSimTime: entry.acceptedAtSimTime, unitId: entry.unitId, abilityId: entry.override.abilityId }
    : { kind: 'PARTY', acceptedAtSimTime: entry.acceptedAtSimTime, order: entry.order === 'retreat' ? 'RETREAT' : 'PRESS_ON' };
}
