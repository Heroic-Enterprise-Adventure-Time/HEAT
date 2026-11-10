import { computed, inject, Service, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import type { OperationVariables, TypedDocumentNode } from '@apollo/client';
import { Apollo } from 'apollo-angular';
import { constantCase, kebabCase } from 'es-toolkit';
import { catchError, combineLatest, firstValueFrom, from, map, type Observable, of, startWith, switchMap } from 'rxjs';

import {
  ADVENTURE_OUTCOMES,
  type AdventureLogEntry,
  type AdventureOutcome,
  type AdventureTimeline,
  buildRefusal,
  FACILITY_KINDS,
  type FacilityKind,
  hallCapacity,
  location,
  MATERIALS,
  must,
  nextLevel,
  recruitCost,
  STAGE_ENDINGS,
  STAGE_KINDS,
  STARTING_LOCATION,
  UNIT_TYPES,
  type UnitType,
  warehouseCapacity,
} from '@heat/engine';

import {
  type AdventureFieldsFragment,
  BuildFacilityDocument,
  type BuildFacilityMutation,
  type CampFieldsFragment,
  DiscardAdventureDocument,
  HeroesSeenAtDocument,
  type HeroFieldsFragment,
  JoinGameDocument,
  MeDocument,
  type MeQuery,
  type OverrideInput,
  RecruitHeroDocument,
  type RecruitHeroMutation,
  type ResultFieldsFragment,
  RetireHeroDocument,
  type RetireHeroMutation,
  type SeenHeroFieldsFragment,
  StartAdventureDocument,
  type StartAdventureMutation,
  SubmitAdventureDocument,
  TimelineDocument,
  type AdventureOutcome as WireAdventureOutcome,
  type FacilityKind as WireFacilityKind,
  type Material as WireMaterial,
  type StageEnding as WireStageEnding,
  type StageKind as WireStageKind,
  type UnitType as WireUnitType,
} from './graphql/generated/graphql';
import { apiError, PREVIOUS, Refusal, type RefusalOf, type Route } from './hub';
import { Session } from './session';

/**
 * A view as the pages read it, derived from the fragment the operation
 * selects (`packages/client/src/app/graphql/*.graphql`, generated into
 * `graphql/generated/`): the same shape, with the engine's closed sets read
 * back from the schema's UPPER_CASE enum values into the engine's own
 * (`VILLAGER` is `villager`; docs/standards/graphql.md, rule 4). A unit
 * type, a material, a stage's kind and its ending are `string`, because a
 * value this client's engine lacks passes through (`engineValues`); a
 * facility kind and an outcome keep the engine's type, which the pages
 * switch on. Nothing past this file sees a wire value.
 */
type Engine<T> = T extends WireUnitType | WireMaterial | WireStageKind | WireStageEnding
  ? string
  : T extends WireFacilityKind
    ? FacilityKind
    : T extends WireAdventureOutcome
      ? AdventureOutcome
      : T extends readonly (infer U)[]
        ? readonly Engine<U>[]
        : T extends object
          ? { readonly [K in keyof T]: Engine<T[K]> }
          : T;

export type HeroView = Engine<HeroFieldsFragment>;
/** Another player's hero seen at the location: its public fields only, never whose it is (decision 0029). */
export type SeenHeroView = Engine<SeenHeroFieldsFragment>;
export type CampView = Engine<CampFieldsFragment>;
/**
 * The player's one open adventure: its job and its party (Issue-115), and
 * the seed and the snapshot the client plays it from (Issue-15).
 */
export type AdventureView = Engine<AdventureFieldsFragment>;
/** What the hub's replay found and settlement wrote (Issue-114). */
export type AdventureResultView = Engine<ResultFieldsFragment>;

type MePlayer = NonNullable<MeQuery['me']>;
/** The signed-in player: `camps` and `heroes` are nulled only for another caller (graphql.md, rule 11), never for the player's own read. */
export type PlayerView = Engine<Omit<MePlayer, 'camps' | 'heroes'> & { readonly camps: readonly CampFieldsFragment[]; readonly heroes: readonly HeroFieldsFragment[] }>;

/** The refusals each mutation can answer, by type, which the tables of the player's words are keyed by (angular.md, rule 6). */
export type RecruitRefusal = RefusalOf<RecruitHeroMutation['recruitHero']>;
export type BuildRefusal = RefusalOf<BuildFacilityMutation['buildFacility']>;
export type RetireRefusal = RefusalOf<RetireHeroMutation['retireHero']>;
export type StartRefusal = RefusalOf<StartAdventureMutation['startAdventure']>;

/**
 * An adventure just ended, kept until the player leaves its result: the
 * result the hub answered, or null when no deploy could verify it any more
 * and it was discarded.
 */
export interface SettledView {
  readonly adventure: AdventureView;
  readonly result: AdventureResultView | null;
}

/**
 * The engine's value behind a schema enum name, `VILLAGER` for `villager`,
 * looked up in a map built once per list. A name this client's engine lacks,
 * sent by a newer deploy before the `outdated` reload (decision 0030), passes
 * through in the engine's spelling rather than failing the whole read, as a
 * string did before the enums: the page shows it as content it does not know
 * (angular.md, rule 6).
 */
function engineValues<T extends string>(values: readonly T[]): (name: string) => T {
  const byName = new Map(values.map((value) => [constantCase(value), value]));
  return (name) => byName.get(name) ?? (kebabCase(name) as T);
}

/** An engine value's spelling on the wire: `heroes-hall` is `HEROES_HALL` (graphql.md, rule 4). */
type ConstantCase<S extends string> = Uppercase<S extends `${infer Head}-${infer Tail}` ? `${Head}_${ConstantCase<Tail>}` : S>;

/**
 * The schema's enum name of each engine value, `villager` as `VILLAGER`,
 * looked up in a map built once per list. The enum is built from the same
 * list (graphql.md, rule 4), so the names are its members: the compiler
 * checks that where a name is sent, against the generated input type. The
 * cast says what `constantCase` does, in the type's own terms.
 */
function wireNames<E extends string>(values: readonly E[]): (value: E) => ConstantCase<E> {
  const byValue = new Map(values.map((value) => [value, constantCase(value) as ConstantCase<E>]));
  return (value) => must(byValue.get(value), `${value} on the wire`);
}

const unitType = engineValues(UNIT_TYPES);
const material = engineValues(MATERIALS);
const facilityKind = engineValues(FACILITY_KINDS);
const outcome = engineValues(ADVENTURE_OUTCOMES);
const stageKind = engineValues(STAGE_KINDS);
const stageEnding = engineValues(STAGE_ENDINGS);
const wireUnitType = wireNames(UNIT_TYPES);
const wireFacilityKind = wireNames(FACILITY_KINDS);
const materials = <T extends { readonly material: string }>(items: readonly T[]) => items.map((item) => ({ ...item, material: material(item.material) }));

function heroFromWire(hero: HeroFieldsFragment): HeroView {
  return { ...hero, unitType: unitType(hero.unitType) };
}

function seenHeroFromWire(hero: SeenHeroFieldsFragment): SeenHeroView {
  return { ...hero, unitType: unitType(hero.unitType) };
}

function campFromWire(camp: CampFieldsFragment): CampView {
  return {
    ...camp,
    holdings: materials(camp.holdings),
    facilities: camp.facilities.map((f) => ({ ...f, kind: facilityKind(f.kind) })),
  };
}

function adventureFromWire(adventure: AdventureFieldsFragment): AdventureView {
  return {
    ...adventure,
    snapshot: { ...adventure.snapshot, heroes: adventure.snapshot.heroes.map((h) => ({ ...h, unitType: unitType(h.unitType) })) },
  };
}

function resultFromWire(result: ResultFieldsFragment): AdventureResultView {
  return {
    ...result,
    outcome: outcome(result.outcome),
    stages: result.stages.map((s) => ({ ...s, kind: stageKind(s.kind), ended: stageEnding(s.ended) })),
    rewards: materials(result.rewards),
    credited: materials(result.credited),
    lost: materials(result.lost),
  };
}

function playerFromWire(player: MePlayer): PlayerView {
  return {
    ...player,
    camps: (player.camps ?? []).map(campFromWire),
    heroes: (player.heroes ?? []).map(heroFromWire),
    openAdventure: player.openAdventure ? adventureFromWire(player.openAdventure) : null,
  };
}

/**
 * A mutation's result union as the client selects it: the type's name, the
 * success's fields when the mutation did its work, and the refusal's
 * message otherwise (graphql.md, rule 6).
 */
interface Answer {
  readonly __typename: string;
  readonly message?: string;
}

/** The success member, or the refusal thrown as a `Refusal` named by its type, for the panel that asked to show. */
function answered<A extends Answer, S extends A['__typename']>(answer: A, success: S): Extract<A, { readonly __typename: S }> {
  if (answer.__typename === success) return answer as Extract<A, { readonly __typename: S }>;
  throw new Refusal(answer.__typename, answer.message ?? answer.__typename);
}

/** The player's query as it last answered: what Apollo's result carries, or the join's failure in its place. */
interface Loaded {
  readonly data: MeQuery | undefined;
  readonly loading: boolean;
  readonly error: unknown;
}

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
 * adventure, watched through Apollo from the moment they sign in, and what
 * they can do yet: recruit a hero, retire one, build a facility and start a
 * job from the job board. Joining comes first, because the profile is made
 * on first sign-in (joinGame, Issue-81), and the player's query follows it.
 * Beside them, a few of other players' heroes seen at the camp's location,
 * read again when the player signs in or changes camps, not after each
 * change of their own, so the passers-by do not shuffle on every recruit.
 *
 * Every mutation sends one input object and answers a result union; a
 * refusal is a member of the union, thrown here as a `Refusal` named by its
 * type for the panel to show in place (graphql.md, rules 5 and 6), and the
 * player's query is read again either way, since a refusal means the view
 * was stale. The in-flight state of an action belongs to the control that
 * started it, beside the refusal it shows (angular.md, rule 6).
 */
@Service()
export class Game {
  private readonly apollo = inject(Apollo);
  private readonly session = inject(Session);

  /** The player's query, run once signed in and joined, and read again after every mutation. */
  private readonly me = this.apollo.watchQuery({ query: MeDocument, fetchPolicy: 'network-only' });
  private readonly loaded = toSignal(
    toObservable(this.session.user).pipe(
      switchMap((user): Observable<Loaded | null> =>
        user
          ? from(this.join()).pipe(
              switchMap(() => this.me.valueChanges),
              map((result): Loaded => ({ data: result.dataState === 'complete' ? result.data : undefined, loading: result.loading, error: result.error })),
              catchError((e: unknown) => of<Loaded>({ data: undefined, loading: false, error: e })),
            )
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** The camp on screen; the header bar's select changes it. */
  readonly location = signal(STARTING_LOCATION);
  /** The player as the hub last answered, or null before the first read and while nobody is signed in. */
  readonly player = computed(() => {
    const me = this.loaded()?.data?.me;
    return me ? playerFromWire(me) : null;
  });
  /** Whether the player's query is in flight, at sign-in or after a mutation. */
  readonly loading = computed(() => this.loaded()?.loading ?? false);
  /** Why the player could not be read, in the hub's words, or null. */
  readonly error = computed(() => {
    const e = this.loaded()?.error;
    return e === undefined ? null : apiError(e).message;
  });

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
  /**
   * A few of other players' heroes seen at the camp's location, who walk
   * about it for flavor: read when the player signs in or changes camps,
   * and empty while the read is under way. The sample is flavor: if it
   * cannot be read, the camp shows no passers-by and says nothing.
   */
  private readonly seen = toSignal(
    combineLatest([toObservable(this.session.user), toObservable(this.location)]).pipe(
      switchMap(([user, at]) =>
        user
          ? this.apollo.query({ query: HeroesSeenAtDocument, variables: { location: at }, fetchPolicy: 'network-only' }).pipe(
              map((result) => result.data?.heroesSeenAt ?? []),
              catchError(() => of([])),
              startWith([]),
            )
          : of([]),
      ),
    ),
    { initialValue: [] },
  );
  readonly seenHere = computed(() => this.seen().map(seenHeroFromWire));
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

  /**
   * Recruits a hero of the unit type, with a fresh request id; the hub
   * draws its name and look, and debits its cost. Answers the new hero, or
   * throws the hub's refusal, a `Refusal` named by its type, for the hall to
   * show in place. The player is read again either way, since a refusal
   * such as `HallFull` means the view was stale.
   */
  async recruit(unitType: UnitType): Promise<HeroView> {
    try {
      const input = { unitType: wireUnitType(unitType), requestId: crypto.randomUUID() };
      const data = await this.mutate(RecruitHeroDocument, { input });
      return heroFromWire(answered(must(data.recruitHero, 'recruitHero'), 'RecruitHeroSuccess').hero);
    } finally {
      await this.reload();
    }
  }

  /**
   * Builds the facility's next level at the camp on screen. Answers when it
   * is built, or throws the hub's refusal, a `Refusal` named by its type, for
   * the panel to show in place. The player is read again either way, since
   * a refusal means the view was stale.
   */
  async build(kind: FacilityKind, level: number): Promise<void> {
    try {
      const input = { location: this.location(), kind: wireFacilityKind(kind), level };
      const data = await this.mutate(BuildFacilityDocument, { input });
      answered(must(data.buildFacility, 'buildFacility'), 'BuildFacilitySuccess');
    } finally {
      await this.reload();
    }
  }

  /**
   * Retires a hero, alive or dead: permanent. Answers the hero as retired,
   * or throws the hub's refusal, a `Refusal` named by its type, for the
   * card to show in place. The player is read again either way.
   */
  async retire(heroId: string): Promise<HeroView> {
    try {
      const data = await this.mutate(RetireHeroDocument, { input: { heroId } });
      return heroFromWire(answered(must(data.retireHero, 'retireHero'), 'RetireHeroSuccess').hero);
    } finally {
      await this.reload();
    }
  }

  /**
   * Starts a job from the location's job board with a party of the player's
   * heroes there. Answers the open adventure, or throws the hub's refusal,
   * a `Refusal` named by its type, for the job board to show in place. The
   * player is read again either way, since a refusal such as
   * `AdventureOpen` means the view was stale.
   */
  async startAdventure(location: string, jobId: string, heroIds: readonly string[]): Promise<AdventureView> {
    try {
      // One request id per start, which becomes the adventure's id: a repeat of this request answers the adventure it started.
      const input = { requestId: crypto.randomUUID(), location, jobId, heroIds };
      const data = await this.mutate(StartAdventureDocument, { input });
      return adventureFromWire(answered(must(data.startAdventure, 'startAdventure'), 'StartAdventureSuccess').adventure);
    } finally {
      await this.reload();
    }
  }

  /**
   * Submits the adventure's override log and keeps what the hub answered in
   * `settled`, then reads the player again. An adventure another deploy
   * issued is refused with EngineUpdated, and goes to the deploy before,
   * `/previous/graphql`; refused there too, no deploy can verify it, so
   * it is discarded and the result is null (decision 0030). Refused with
   * AdventureDiscarded, it was discarded already, and it settles the same
   * way, so the page says so instead of leaving for the camp. Any other
   * refusal or failure is thrown, and the log stays saved for another try.
   * The player is read again either way, since a refusal means the view
   * was stale.
   */
  async submitAdventure(adventure: AdventureView, log: readonly AdventureLogEntry[]): Promise<void> {
    try {
      const input = { adventureId: adventure.id, overrides: log.map(overrideInput) };
      const submit = async (route: Route) => must((await this.mutate(SubmitAdventureDocument, { input }, route)).submitAdventure, 'submitAdventure');
      let result: AdventureResultView | null = null;
      let answer = await submit('current');
      if (answer.__typename === 'EngineUpdated') answer = await submit(PREVIOUS);
      if (answer.__typename === 'EngineUpdated') {
        const data = await this.mutate(DiscardAdventureDocument, { input: { adventureId: adventure.id } });
        answered(must(data.discardAdventure, 'discardAdventure'), 'DiscardAdventureSuccess');
      } else if (answer.__typename !== 'AdventureDiscarded') {
        result = resultFromWire(must(answered(answer, 'SubmitAdventureSuccess').adventure.result, 'the settled result'));
      }
      this.settled.set({ adventure, result });
    } finally {
      await this.reload();
    }
  }

  /** The timeline the hub stored at settlement, for the replay: display only, played with no engine (decision 0030). */
  async timeline(adventureId: string): Promise<AdventureTimeline | null> {
    let data;
    try {
      ({ data } = await firstValueFrom(this.apollo.query({ query: TimelineDocument, variables: { id: adventureId }, fetchPolicy: 'network-only' })));
    } catch (e) {
      throw apiError(e);
    }
    // The JSON scalar carries the engine's own AdventureTimeline, which the hub's replay wrote (decision 0030).
    return (data?.adventure?.timeline as AdventureTimeline | null | undefined) ?? null;
  }

  /** Makes the player's profile if they have none; called before the player is read, after every sign-in. */
  private async join(): Promise<void> {
    const data = await this.mutate(JoinGameDocument, {});
    answered(must(data.joinGame, 'joinGame'), 'JoinGameSuccess');
  }

  /** One mutation, on the current deploy or the previous one, answering its data or throwing what Apollo threw as an `ApiError`. */
  private async mutate<TData, TVariables extends OperationVariables>(
    mutation: TypedDocumentNode<TData, TVariables>,
    variables: TVariables,
    route: Route = 'current',
  ): Promise<TData> {
    let data;
    try {
      ({ data } = await firstValueFrom(this.apollo.mutate({ mutation, variables, context: { route } })));
    } catch (e) {
      throw apiError(e);
    }
    return must(data, 'the mutation’s data');
  }

  /** Reads the player again after a mutation; a failed read leaves the view as it was, since the mutation's own answer is what matters. */
  private async reload(): Promise<void> {
    await this.me.refetch().catch(() => undefined);
  }
}

/** The engine's log entry as the hub's flat `OverrideInput`. */
export function overrideInput(entry: AdventureLogEntry): OverrideInput {
  return entry.kind === 'unit'
    ? { kind: 'UNIT', acceptedAtSimTime: entry.acceptedAtSimTime, unitId: entry.unitId, abilityId: entry.override.abilityId }
    : { kind: 'PARTY', acceptedAtSimTime: entry.acceptedAtSimTime, order: entry.order === 'retreat' ? 'RETREAT' : 'PRESS_ON' };
}
