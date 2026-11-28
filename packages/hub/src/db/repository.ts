import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { EntityItem } from "electrodb";
import { omit } from "es-toolkit";

import {
  type AdventureOutcome,
  type AdventureSnapshot,
  type Cost,
  type FacilityKind,
  isUnlockId,
  location as locationOf,
  type Material,
  must,
  type Requirement,
  type Reward,
  type StageResult,
  UNIT_PROFILES,
  type UnitStats,
  type UnitType,
  unlockedLocations,
  type UnlockId,
} from "@heat/engine";

import { type RecentAdventure, recentOf } from "../recent.js";
import { type Sighting, sightingOf } from "../seen.js";
import type { Tables } from "./client.js";
import { createService, type HeatService } from "./entities.js";
import type { ADVENTURE_STATUSES, HERO_STATUSES } from "./statuses.js";

/**
 * The transactions the architecture names, as DynamoDB transactions: start
 * (the one-open-adventure rule, and the party marked as adventuring),
 * debit (the ledger's non-negative balance), settle (the result once, keyed
 * on the adventure id, with the credits capped at the warehouse, the XP and
 * the deaths), discard (an adventure closed with nothing credited), recruit
 * (the hall's cap and the free-villager rule, on the camp's counts, and the
 * cost's debits with their ledger entries),
 * retire (the hero's status and the camp's counts together, never while the
 * hero is adventuring) and build (a facility's next level, the facilities it
 * needs, and the cost's debits with their ledger entries). Each is one
 * TransactWriteItems call with condition checks; a failed condition cancels
 * the whole write and the cancellation reasons say which item failed.
 *
 * Start, recruit and build take a location, and where the location needs an
 * unlock each checks, in its transaction, that the player holds it (decision
 * 0059); the starting location needs none, and its transactions carry no such
 * check. Settle writes each unlock the result lists, only if it is absent.
 *
 * Start and settle write to both tables in one transaction: the player's
 * open item and ledger in the player table, the adventure record in the
 * location table. Recruit and retire do too, for the hero's sighting at its
 * location (decision 0029), and settle for the adventure's item in its
 * location's feed (decision 0050). TransactWriteItems spans tables in one account and
 * region, so the split of decision 0023 costs the transactions nothing.
 *
 * Every read and every write goes through ElectroDB (entities.ts, decision 0041).
 */

export class AdventureAlreadyOpen extends Error {}
export class InsufficientBalance extends Error {}
export class AlreadyApplied extends Error {}
export class TransactionConflict extends Error {}
export class HeroExists extends Error {}
export class RecruitRefused extends Error {}
export class HeroChanged extends Error {}
/** A facility's level, or a facility it needs, is not as the build read it. */
export class BuildRefused extends Error {}
/** A facility the job needs is not built, though the start read it built. */
export class FacilityMissing extends Error {}
/** A balance or the warehouse changed between settlement's read and its write: read again and retry. */
export class CampChanged extends Error {}
/** The open item is gone or the record is no longer open: settled or discarded already. */
export class AdventureClosed extends Error {}
/** The location needs an unlock the player does not hold, so the player has no camp there. */
export class LocationLocked extends Error {}
/** The destination's hall cannot hold the heroes a caravan means to leave there, or is not at the level read. */
export class DestinationFull extends Error {}

export interface Player {
  id: string;
  name: string;
}

export interface Holding {
  material: Material;
  balance: number;
}

/** An unlock the player holds, from its `UNLOCK#<unlock>` item: when it was first earned, and by which adventure (decision 0059). */
export interface EarnedUnlock {
  unlock: UnlockId;
  earnedAt: string;
  adventureId: string;
}

/**
 * A camp: one player's view of one location (decision 0026). A camp with no
 * item is at level 1 with no heroes, at the starting location and at any
 * location whose unlock the player holds (decision 0059); `stored` says
 * whether the item exists, which is what the recruit transaction's
 * condition depends on.
 */
export interface Camp {
  location: string;
  hallLevel: number;
  warehouseLevel: number;
  activeHeroes: number;
  livingHeroes: number;
  holdings: Holding[];
  /** The facilities the camp has built, by kind, from their `AT#<location>#FACILITY#<kind>` items; one missing is at level 0. */
  facilities: Partial<Record<FacilityKind, number>>;
  stored: boolean;
}

/**
 * The hall's and the warehouse's levels live on the camp's item, which the
 * recruit and settle transactions already condition on; every other own
 * facility has an item of its own (decision 0032).
 */
const ON_CAMP: Partial<Record<FacilityKind, "hallLevel" | "warehouseLevel">> = {
  "heroes-hall": "hallLevel",
  warehouse: "warehouseLevel",
};

/** Every own facility's level at the camp: the hall and the warehouse from the camp, the rest from their items. */
export function campLevels(camp: Camp): Partial<Record<FacilityKind, number>> {
  return { ...camp.facilities, "heroes-hall": camp.hallLevel, warehouse: camp.warehouseLevel };
}

/** A build of one level: the facility, the level it is at as read, and what the next costs and needs. */
export interface Build {
  kind: FacilityKind;
  from: number;
  cost: Cost;
  requires: readonly Requirement[];
}

/** The ledger's cause for a build: each level of each facility at a camp is built once. */
export function buildCause(location: string, kind: FacilityKind, level: number): string {
  return `build-${location}-${kind}-${level}`;
}

export type HeroStatus = (typeof HERO_STATUSES)[number];

/**
 * A hero's item (overview, "Camps, heroes and resources"). The stat-boost
 * picks are the choices, not the resulting numbers. The weapon and the
 * history counters arrive with the features that write them, and default
 * in code until then.
 */
export interface Hero {
  id: string;
  /** Where the hero is: where it was recruited, until a caravan moves it (decision 0059). */
  location: string;
  /**
   * Where the hero was recruited, which nothing changes. A hero recruited
   * before Issue-354 has no such attribute and is read as its location, which
   * is where it was recruited, since nothing moved a hero before then; the
   * settlement that first moves it writes the attribute from there.
   */
  recruitedIn: string;
  unitType: UnitType;
  spriteSet: string;
  name: string;
  recruitedAt: string;
  level: number;
  xp: number;
  picks: string[];
  status: HeroStatus;
  retiredAt: string | null;
  /** The open adventure the hero is on, set by start and cleared by settlement; null when it is at the camp. */
  adventureId: string | null;
}

/** The player's open-adventure item: which adventure is open, and its seed. */
export interface OpenAdventure {
  adventureId: string;
  seed: string;
  startedAt: string;
}

/**
 * The adventure record in the location table, written at start: the seed,
 * the location, the job, the frozen snapshot and the version that issued it
 * (decision 0030). Records the spike started before Issue-113 have none of
 * the last four, and are never verified: they are another version's.
 *
 * Settlement adds the result and its time, a discard its time (Issue-114).
 */
export interface AdventureRecord {
  adventureId: string;
  playerId: string;
  seed: string;
  location: string;
  jobId: string;
  snapshot: AdventureSnapshot;
  version: string;
  startedAt: string;
  status: AdventureStatus;
  /** A caravan's destination, its cargo and who stays, on a job that delivers; absent on any other (decision 0059). */
  caravan?: Caravan | undefined;
  result?: SettledResult | undefined;
  settledAt?: string | undefined;
  discardedAt?: string | undefined;
}

/**
 * A rider (Issue-391, amending decision 0059): a hero who stays at a
 * caravan's destination without being of its party, by its id and the name
 * it had at the start. It is not in the snapshot, since it does not fight,
 * and a settled adventure is read by anyone, so the record is what names it.
 */
export interface CaravanRider {
  heroId: string;
  name: string;
}

/**
 * A caravan as its start wrote it (decision 0059): the location it delivers
 * to, each resource of the cargo once, debited from the origin's holdings,
 * and everyone marked to stay, the heroes of the party and the riders alike,
 * whose slots are held at the destination until the adventure ends. The
 * riders are named again in `riders`; a caravan written before Issue-391 has
 * none and is read so.
 */
export interface Caravan {
  destination: string;
  cargo: Reward[];
  staying: string[];
  riders: CaravanRider[];
}

/** What a caravan's start writes beside the adventure: the destination camp as read, for the slots it holds there. */
export interface CaravanStart {
  caravan: Caravan;
  destination: Camp;
  /** The destination hall's cap, at the level read. */
  capacity: number;
}

export type AdventureStatus = (typeof ADVENTURE_STATUSES)[number];

/** One hero at settlement: the XP it gained, its totals after, and whether it died. */
export interface HeroOutcome {
  heroId: string;
  xpGained: number;
  xp: number;
  level: number;
  health: number;
  dead: boolean;
}

/**
 * What settlement recorded (overview, "Camps, heroes and resources"): how
 * each stage ended and overall the rewards the run yielded, what the
 * warehouse took and what its cap lost, each hero's XP, level and fate, and
 * the unlocks the run earned, whether or not the player held them already:
 * the result is public, and which were new is the owner's alone to read, from
 * their own unlocks (decision 0059).
 */
export interface SettledResult {
  outcome: AdventureOutcome;
  endedAtMs: number;
  reachedStage: number;
  stages: StageResult[];
  rewards: Reward[];
  credited: Reward[];
  lost: Reward[];
  heroes: HeroOutcome[];
  unlocks: UnlockId[];
  /** What a caravan's cargo put into the destination's warehouse; none for a job that delivers nothing, a broken cart, a retreat or a defeat. */
  delivered: Reward[];
  /** What the destination warehouse's cap turned away of the cargo. */
  deliveryLost: Reward[];
}

/** A resource credited to a holding up to its warehouse's cap: the balance read, null where there is no item, and what the cap took and turned away. */
export interface CappedCredit {
  material: Material;
  read: number | null;
  credit: number;
  lost: number;
}

/**
 * A caravan's part of settlement (decision 0059), from the destination camp
 * as read: what the cargo credits there, which heroes land, and how many of
 * the slots held there are let go.
 */
export interface CaravanSettlement {
  destination: string;
  warehouseLevel: number;
  /** Whether the destination camp has an item, which the condition on its warehouse depends on. */
  stored: boolean;
  /** Each resource of the cargo up to the destination's cap; none unless the run arrived with the cart standing. */
  deliveries: CappedCredit[];
  /** Everyone marked to stay, of the party or riding, on arrival, alive or dead; none on any other end. */
  landed: string[];
  /** The slots held at the destination that are let go: one per hero marked to stay, on any end but arrival. */
  released: number;
}

/** A discarded caravan's cargo going home (decision 0059): the origin camp's warehouse as read, and each resource up to its cap. */
export interface CaravanReturn {
  warehouseLevel: number;
  stored: boolean;
  returns: CappedCredit[];
}

/**
 * Settlement's writes, computed by the caller from what it read: the camp's
 * warehouse level, each holding's balance (null where there is no item yet)
 * and what goes into it, each survivor's new XP and level, and the dead.
 */
export interface Settlement {
  adventureId: string;
  location: string;
  jobId: string;
  warehouseLevel: number;
  holdings: CappedCredit[];
  survivors: { hero: Hero; xp: number; level: number }[];
  dead: Hero[];
  /** A caravan's riders as read, each alive and on this adventure: none of them fought, so none gains XP or dies (Issue-391). */
  riders: Hero[];
  result: SettledResult;
  /** A caravan's writes at its destination; absent for a job that delivers nothing. */
  caravan?: CaravanSettlement | undefined;
}
type Failure = new (message: string) => Error;

/** An item as DynamoDB answers it, which a raw read gives with its keys. */
type RawItem = { SK: string } & Record<string, unknown>;

/**
 * What a read with `data: "raw"` answers, whatever `go`'s type says: one
 * DynamoDB page, whatever `pages` says.
 */
interface RawPage {
  Items: RawItem[];
  ScannedCount: number;
  LastEvaluatedKey?: Record<string, unknown>;
}

function rawPage(response: { data: unknown }): RawPage {
  return response.data as RawPage;
}

const STRONG = { consistent: true } as const;

/**
 * An item as it is read. `required` holds on a write and not on a read, and an
 * item written before these attributes existed may lack them, which their
 * readers default.
 */
type MayLack<T, Absent extends keyof T> = Omit<T, Absent> & Partial<Pick<T, Absent>>;
type Stored<Name extends keyof HeatService["entities"]> = EntityItem<HeatService["entities"][Name]>;

/**
 * Keeps each item of a transaction beside the error its condition throws, in
 * the order of the items, for `throwIfCancelled`; an item whose write has no
 * condition takes its verb's, which nothing can then raise.
 */
function failing(failures: Failure[]) {
  return <Item>(failure: Failure, item: Item): Item => {
    failures.push(failure);
    return item;
  };
}

function toSighting(i: MayLack<Stored<"sighting">, "level">): Sighting {
  return {
    heroId: i.heroId,
    location: i.location,
    name: i.name,
    unitType: i.unitType,
    spriteSet: i.spriteSet,
    level: i.level ?? 1,
    seenAt: i.seenAt,
    expiresAt: i.expiresAt,
  };
}

function emptyCamp(location: string): Camp {
  return { location, hallLevel: 1, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0, holdings: [], facilities: {}, stored: false };
}

function campCounts(i: MayLack<Stored<"camp">, "hallLevel" | "warehouseLevel" | "activeHeroes" | "livingHeroes">) {
  return {
    hallLevel: i.hallLevel ?? 1,
    warehouseLevel: i.warehouseLevel ?? 1,
    activeHeroes: i.activeHeroes ?? 0,
    livingHeroes: i.livingHeroes ?? 0,
    stored: true,
  };
}

function toHero(i: MayLack<Stored<"hero">, "level" | "xp" | "picks" | "status" | "recruitedIn">): Hero {
  return {
    id: i.id,
    location: i.location,
    recruitedIn: i.recruitedIn ?? i.location,
    unitType: i.unitType,
    spriteSet: i.spriteSet,
    name: i.name,
    recruitedAt: i.recruitedAt,
    level: i.level ?? 1,
    xp: i.xp ?? 0,
    picks: i.picks ?? [],
    status: i.status ?? "ALIVE",
    retiredAt: i.retiredAt ?? null,
    adventureId: i.adventureId ?? null,
  };
}

/**
 * A snapshot with every hero's gathering traits. One issued before the
 * traits (Issue-339, decision 0058) has none, its stats carrying the gather
 * ratings of decision 0051 or the one stat before them, and is still read:
 * while its adventure is open across that deploy, and for good once settled,
 * since a settled adventure answers its snapshot. Its heroes take their unit
 * type's traits of today, as they took its ratings (Issue-283), so a client
 * that resumes the run shows it gathering. Today's traits include any added
 * since: such a snapshot's ranger is read as skinning (Issue-340), so the
 * page counts hide that the issuing deploy, which had no hide, never
 * credits, as it shows timber by the drop's rule and is credited by the
 * harvest's. Accepted for the one release that crosses both changes (the
 * owner, 2026-11-20, the review of PR-346). The deploy that issued it
 * verifies it, from the record as that deploy reads it (decision 0030), so
 * what this adds is never what a result is computed from.
 */
export function withTraits(snapshot: AdventureSnapshot): AdventureSnapshot {
  const heroes = snapshot.heroes.map((hero) => {
    const stats: MayLack<UnitStats, "traits"> = hero.stats;
    return stats.traits ? hero : { ...hero, stats: { ...hero.stats, traits: UNIT_PROFILES[hero.unitType]?.stats.traits ?? [] } };
  });
  return { ...snapshot, heroes };
}

const hasSnapshot = (i: MayLack<Stored<"adventure">, "snapshot">): boolean => i.snapshot !== undefined;

/**
 * A result as this deploy reads it. One settled before unlocks (Issue-351)
 * lists none and is read as having earned none; an unlock this deploy's
 * content does not know, which the deploy after it may have written, is left
 * out, as a job it does not know is (recent.ts). One settled before caravans
 * (Issue-354) delivered nothing, and is read so.
 */
function readResult(result: MayLack<SettledResult, "unlocks" | "delivered" | "deliveryLost">): SettledResult {
  return { ...result, unlocks: (result.unlocks ?? []).filter(isUnlockId), delivered: result.delivered ?? [], deliveryLost: result.deliveryLost ?? [] };
}

/** A caravan as this deploy reads it: one written before riders (Issue-391) names none, and carried none. */
function readCaravan(caravan: MayLack<Caravan, "riders">): Caravan {
  return { ...caravan, riders: caravan.riders ?? [] };
}

/** A record from before Issue-113 has no snapshot and is answered as it is. */
function toAdventure(i: Stored<"adventure">): AdventureRecord {
  const stored: AdventureRecord = hasSnapshot(i) ? { ...i, snapshot: withTraits(i.snapshot) } : i;
  const record: AdventureRecord = stored.caravan ? { ...stored, caravan: readCaravan(stored.caravan) } : stored;
  return record.result ? { ...record, result: readResult(record.result) } : record;
}

/**
 * The heroes an adventure's start marks with its id, each once: the party,
 * and a caravan's riders, who are of no party (Issue-391). The start and the
 * discard read it here, so that one cannot mark a hero the other leaves
 * marked.
 */
function marked(record: AdventureRecord): string[] {
  return [...record.snapshot.heroes.map((h) => h.heroId), ...(record.caravan?.riders ?? []).map((r) => r.heroId)];
}

/** The entities as a transaction's callback is handed them. */
type TransactionItems = Parameters<Parameters<HeatService["transaction"]["write"]>[0]>[0];

/**
 * The condition checks that the player holds the unlocks the locations need,
 * none where they need none (decision 0059). Written once, for
 * every transaction that takes a location (graphql.md, rule 28): one that
 * checked differently would be a location open by one verb.
 */
function unlockHeld(items: TransactionItems, playerId: string, ...locations: string[]) {
  // One check for each unlock: a transaction may name an item only once, and two locations may need the same one.
  const unlocks = new Set(locations.map((location) => locationOf(location)?.unlock).filter((unlock) => unlock !== undefined));
  return [...unlocks].map((unlock) =>
    items.unlock
      .check({ playerId, unlock })
      .where((a, op) => op.exists(a.earnedAt))
      .commit(),
  );
}

/**
 * The capped credits of one camp's holdings, each on the condition that the
 * balance is the one read, with the adventure's ledger entry
 * `<entry>#<material>` saying the credit and what the cap lost: settlement's
 * credits at the origin, a caravan's deliveries at the destination and a
 * discard's returns (decisions 0030 and 0059). Written once for the three
 * (graphql.md, rule 28). A credit of nothing writes the entry alone.
 */
function cappedCredits(
  items: TransactionItems,
  on: ReturnType<typeof failing>,
  playerId: string,
  adventureId: string,
  location: string,
  entry: "credit" | "deliver" | "return",
  credits: readonly CappedCredit[],
) {
  return credits.flatMap(({ material, read, credit, lost }) => [
    ...(credit > 0
      ? [
          on(
            CampChanged,
            items.holding
              .update({ playerId, location, material })
              .set({ balance: (read ?? 0) + credit })
              .where((a, op) => (read === null ? op.notExists(a.balance) : op.eq(a.balance, read)))
              .commit(),
          ),
        ]
      : []),
    on(AdventureClosed, items.ledger.create({ playerId, cause: adventureId, entry: `${entry}#${material}`, location, material, delta: credit, lost }).commit()),
  ]);
}

/** The check that a camp's warehouse is at the level read, which every capped credit depends on; a camp with no item has no warehouse attribute. */
function warehouseHeld(items: TransactionItems, playerId: string, location: string, stored: boolean, warehouseLevel: number) {
  return items.camp
    .check({ playerId, location })
    .where((a, op) => (stored ? op.eq(a.warehouseLevel, warehouseLevel) : op.notExists(a.warehouseLevel)))
    .commit();
}

/**
 * What ElectroDB answers for a transaction: `failures` maps the index of a
 * cancelled item to the error to throw when its condition failed; a conflict
 * with another transaction throws TransactionConflict for the caller to
 * retry.
 *
 * No ClientRequestToken: DynamoDB's token makes an identical repeat a silent
 * success for ten minutes, which would hide exactly the repeats the condition
 * checks exist to report. The conditions are the idempotency mechanism, keyed
 * on the adventure id as the architecture states, and a repeat is a typed
 * error the caller maps (a repeated settle is AdventureClosed, which submit
 * answers with the settled record).
 */
function throwIfCancelled(
  result: { canceled: boolean; data: readonly { code?: string | undefined; message?: string | undefined }[] },
  failures: readonly Failure[],
): void {
  if (!result.canceled) return;
  const conflict = result.data.find((item) => item.code === "TransactionConflict");
  if (conflict) throw new TransactionConflict(conflict.message ?? "conflict");
  const i = result.data.findIndex((item) => item.code === "ConditionalCheckFailed");
  const Err = failures[i];
  if (Err) throw new Err(`condition failed on item ${i}`);
  const reasons = result.data.flatMap((item) => (item.code && item.code !== "None" ? [`${item.code}: ${item.message ?? "no message"}`] : []));
  throw new Error(`transaction cancelled: ${reasons.join(", ")}`);
}

/**
 * Every read but the sightings' is strongly consistent: the hub answers a
 * record as it is, and a request that loses a race reads again to find the
 * winner's writes, which an eventually consistent read may not show yet
 * (graphql.md, rule 9). A sighting is a sample, so a stale one is harmless.
 */
export class Repository {
  private readonly service: HeatService;

  constructor(db: DynamoDBDocumentClient, tables: Tables) {
    this.service = createService(db, tables);
  }

  async putPlayer(player: Player): Promise<void> {
    await this.service.entities.profile.put(player).go();
  }

  /**
   * The profile on first sign-in, named with the player's id (decision 0043):
   * written if absent, left alone if present, in one call, so a repeat or a
   * race between two tabs is harmless.
   */
  async joinPlayer(id: string): Promise<Player> {
    const { data } = await this.service.entities.profile
      .update({ id })
      .data((a, op) => {
        op.ifNotExists(a.name, id);
      })
      .go({ response: "all_new" });
    return { id, name: must(data.name, "the profile's name") };
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const { data } = await this.service.entities.profile.get({ id }).go(STRONG);
    return data ? { id: data.id, name: data.name } : undefined;
  }

  async setBalance(playerId: string, location: string, material: Material, balance: number): Promise<void> {
    await this.service.entities.holding.put({ playerId, location, material, balance }).go();
  }

  /**
   * The unlocks the player holds, from one Query of the `UNLOCK#` items, in
   * key order (decision 0059). An unlock this deploy's content does not know
   * is left out, as it is from a result.
   */
  async unlocks(playerId: string): Promise<EarnedUnlock[]> {
    const { data } = await this.service.entities.unlock.query.primary({ playerId }).go({ ...STRONG, pages: "all" });
    return data.flatMap(({ unlock, earnedAt, adventureId }) => (isUnlockId(unlock) ? [{ unlock, earnedAt, adventureId }] : []));
  }

  /**
   * Every camp of the player, in the content's order: one at the starting
   * location and one at each location whose unlock the player holds, item or
   * not (decisions 0026 and 0059). Two Queries, of the `AT#` items and of the
   * `UNLOCK#` items. Items at a location the player has not unlocked, which no
   * verb writes, are no camp.
   */
  async camps(playerId: string): Promise<Camp[]> {
    const [stored, unlocks] = await Promise.all([this.storedCamps(playerId), this.unlocks(playerId)]);
    return unlockedLocations(new Set(unlocks.map((u) => u.unlock))).map((at) => stored.get(at.id) ?? emptyCamp(at.id));
  }

  /**
   * The camp at a location as its items say, at level 1 with no heroes where
   * it has none. It reads no unlock: whether the player has a camp there is
   * `camps`, and a verb's own check (locations.ts).
   */
  async camp(playerId: string, location: string): Promise<Camp> {
    return (await this.storedCamps(playerId)).get(location) ?? emptyCamp(location);
  }

  /**
   * The camps that have an item, by location, with their holdings and
   * facilities, from one Query of the `AT#` items (decision 0026). The query
   * takes `ignoreOwnership` for good: without it, it is filtered to camps
   * alone (decision 0041).
   */
  private async storedCamps(playerId: string): Promise<Map<string, Camp>> {
    const { camp: campEntity, facility: facilityEntity, holding: holdingEntity } = this.service.entities;
    const camps = new Map<string, Camp>();
    const campAt = (location: string) => {
      let camp = camps.get(location);
      if (!camp) camps.set(location, (camp = emptyCamp(location)));
      return camp;
    };
    for (const item of await this.atItems(playerId)) {
      const [, location, kind] = item.SK.split("#");
      if (!location) continue;
      const camp = campAt(location);
      if (kind === "CAMP") {
        Object.assign(camp, campCounts(must(campEntity.parse({ Item: item }).data, "a camp's item")));
      } else if (kind === "HOLDING") {
        const i = must(holdingEntity.parse({ Item: item }).data, "a holding's item");
        camp.holdings.push({ material: i.material, balance: i.balance });
      } else if (kind === "FACILITY") {
        const i = must(facilityEntity.parse({ Item: item }).data, "a facility's item");
        camp.facilities[i.kind] = i.level;
      }
    }
    return camps;
  }

  async holdings(playerId: string, location: string): Promise<Holding[]> {
    return (await this.camp(playerId, location)).holdings;
  }

  async heroes(playerId: string): Promise<Hero[]> {
    const { data } = await this.service.entities.hero.query.primary({ playerId }).go({ ...STRONG, pages: "all" });
    return data.map(toHero);
  }

  async getHero(playerId: string, heroId: string): Promise<Hero | undefined> {
    const { data } = await this.service.entities.hero.get({ playerId, id: heroId }).go(STRONG);
    return data ? toHero(data) : undefined;
  }

  async openAdventure(playerId: string): Promise<OpenAdventure | undefined> {
    const { data } = await this.service.entities.open.get({ playerId }).go(STRONG);
    return data ? { adventureId: data.adventureId, seed: data.seed, startedAt: data.startedAt } : undefined;
  }

  async getAdventure(adventureId: string): Promise<AdventureRecord | undefined> {
    const { data } = await this.service.entities.adventure.get({ adventureId }).go(STRONG);
    return data ? toAdventure(data) : undefined;
  }

  /**
   * Start: write the open-adventure item only if the player has none, the
   * adventure record only if the id is new, and mark each hero of the party,
   * and each rider of a caravan (Issue-391), with the adventure's id only if
   * it is still alive, at the adventure's location and on no adventure, so a
   * retire, a death or a move that races the start fails one side or the
   * other, and a rider can no more retire or set out again than a hero of
   * the party can; and check that each facility the
   * job needs, the one that posts it, is built at its level or above
   * (Issue-133); and, where the location needs an unlock, that the player
   * holds it (decision 0059). Throws AdventureAlreadyOpen when the first
   * condition fails, HeroChanged when a hero's does, FacilityMissing when a
   * facility's does and LocationLocked when the unlock's does.
   * A job's facility is one a camp builds, so it has an item of its own.
   */
  async startAdventure(
    playerId: string,
    record: Omit<AdventureRecord, "playerId" | "status" | "caravan">,
    needs: readonly Requirement[] = [],
    caravan?: CaravanStart,
  ): Promise<AdventureRecord> {
    const started: AdventureRecord = { ...record, playerId, status: "OPEN", ...(caravan ? { caravan: caravan.caravan } : {}) };
    const { adventureId, seed, startedAt, location } = record;
    const heroIds = marked(started);
    const failures: Failure[] = [];
    const on = failing(failures);
    const result = await this.service.transaction
      .write((items) => [
        on(AdventureAlreadyOpen, items.open.create({ playerId, adventureId, seed, startedAt }).commit()),
        // A record being started has no result and no end, which an absent attribute says.
        on(
          AlreadyApplied,
          items.adventure.create({ ...omit(started, ["result", "settledAt", "discardedAt", "caravan"]), ...(caravan ? { caravan: caravan.caravan } : {}) }).commit(),
        ),
        ...heroIds.map((id) =>
          on(
            HeroChanged,
            items.hero
              .update({ playerId, id })
              .set({ adventureId })
              // True of a hero on no adventure: no adventureId attribute, or a null one, which a hero item written whole would carry.
              .where((a, op) => `${op.eq(a.status, "ALIVE")} AND ${op.eq(a.location, location)} AND NOT ${op.type(a.adventureId, "S")}`)
              .commit(),
          ),
        ),
        ...needs.map((r) =>
          on(
            FacilityMissing,
            items.facility
              .check({ playerId, location, kind: r.kind })
              .where((a, op) => op.gte(a.level, r.level))
              .commit(),
          ),
        ),
        ...unlockHeld(items, playerId, location, ...(caravan ? [caravan.caravan.destination] : [])).map((check) => on(LocationLocked, check)),
        ...(caravan ? this.caravanStartWrites(items, on, playerId, adventureId, location, caravan) : []),
      ])
      .go();
    throwIfCancelled(result, failures);
    return started;
  }

  /**
   * A caravan's writes in its start's transaction (decision 0059): each
   * resource of the cargo debited from the origin's holding on the condition
   * that the balance covers it, with a ledger entry `load` that can exist
   * once; the destination camp's count of active heroes raised by the heroes
   * marked to stay, on the condition that the hall is at the level read and
   * its cap covers them, which is the slot held there. The destination's
   * unlock is checked beside the origin's, in the start's own list.
   */
  private caravanStartWrites(
    items: TransactionItems,
    on: ReturnType<typeof failing>,
    playerId: string,
    adventureId: string,
    origin: string,
    { caravan, destination, capacity }: CaravanStart,
  ) {
    const staying = caravan.staying.length;
    const location = caravan.destination;
    return [
      ...caravan.cargo.flatMap(({ material, amount }) => [
        on(
          InsufficientBalance,
          items.holding
            .update({ playerId, location: origin, material })
            .subtract({ balance: amount })
            .where((a, op) => op.gte(a.balance, amount))
            .commit(),
        ),
        on(AlreadyApplied, items.ledger.create({ playerId, cause: adventureId, entry: `load#${material}`, location: origin, material, delta: -amount }).commit()),
      ]),
      ...(staying > 0
        ? [
            on(
              DestinationFull,
              items.camp
                .update({ playerId, location })
                .data((a, op) => {
                  op.ifNotExists(a.hallLevel, 1);
                  op.ifNotExists(a.warehouseLevel, 1);
                  op.ifNotExists(a.livingHeroes, 0);
                  op.add(a.activeHeroes, staying);
                })
                .where((a, op) => {
                  // No item is a camp at level 1 with no heroes, and every camp item has a hall level.
                  if (!destination.stored) return op.notExists(a.hallLevel);
                  return `${op.eq(a.hallLevel, destination.hallLevel)} AND ${op.lte(a.activeHeroes, capacity - staying)}`;
                })
                .commit(),
            ),
          ]
        : []),
    ];
  }

  /**
   * Debit: reduce a holding only if the balance covers it, and record the
   * ledger entry only once per cause and material. Throws
   * InsufficientBalance or AlreadyApplied.
   */
  async debit(playerId: string, location: string, causeId: string, material: Material, amount: number): Promise<void> {
    if (amount <= 0) throw new RangeError("amount must be positive");
    const failures: Failure[] = [];
    const on = failing(failures);
    const result = await this.service.transaction
      .write((items) => [
        on(
          InsufficientBalance,
          items.holding
            .update({ playerId, location, material })
            .subtract({ balance: amount })
            .where((a, op) => op.gte(a.balance, amount))
            .commit(),
        ),
        on(AlreadyApplied, items.ledger.create({ playerId, cause: causeId, entry: `debit#${material}`, location, material, delta: -amount }).commit()),
      ])
      .go();
    throwIfCancelled(result, failures);
  }

  /**
   * Settle, in one transaction (decision 0014; overview, "Camps, heroes and
   * resources"): the open item deleted only if it is this adventure; the
   * record marked settled with its result only if it is still open, and from
   * then on in its job's replays, by the index's keys (decision 0050); the
   * camp's warehouse level checked against the one the cap was computed
   * from, and its living count decremented by the dead only if it covers
   * them; each survivor's XP and level set and its mark removed, and its
   * sighting refreshed; each dead hero set dead only if it was alive, its
   * mark removed and its sighting deleted (decision 0029); each holding
   * written with its capped credit only if its balance is still the one
   * read, with a ledger entry per material that can exist once and records
   * what the cap lost; and the adventure's item put in its location's feed,
   * its public line with no owner (decision 0050), so an adventure is in the
   * feed exactly when it is settled. Every hero's write is conditioned on its
   * mark being this adventure's.
   *
   * Each unlock the result lists is written with its time and this adventure
   * only where the attribute is absent, with no condition and no read (decision
   * 0059): the first grant makes the item, a later one changes nothing on it
   * and cancels nothing, and a repeat of this settlement is stopped by the
   * record's condition as before. test/electrodb.test.ts holds the write.
   *
   * A caravan (decision 0059) adds its destination's writes
   * (`caravanSettleWrites`), and each hero marked to stay who lands moves
   * there: its location is set, `recruitedIn` written from where it was if
   * the item has none, its sighting moved there if it lives and deleted if it
   * died, and the origin's counts let go of it, the active count always and
   * the living count if it lives, beside the dead's. A rider (Issue-391) is
   * written as a survivor with the XP and the level it had: its mark removed,
   * and moved as any hero who lands is.
   *
   * Throws AdventureClosed when the open item or the record has moved on,
   * which is a repeat or a race with a discard; CampChanged when a balance
   * or the warehouse moved between the caller's read and this write, for the
   * caller to read again; HeroChanged when a hero is no longer on this
   * adventure, which nothing should do.
   */
  async settle(playerId: string, s: Settlement, now = new Date()): Promise<void> {
    const { adventureId, location, warehouseLevel, dead } = s;
    const failures: Failure[] = [];
    const on = failing(failures);
    // A caravan's heroes who land (decision 0059): the origin lets go of each,
    // and of each who lives its living count too, beside the dead's.
    const landed = new Set(s.caravan?.landed ?? []);
    const destination = s.caravan?.destination ?? location;
    // A rider is written as a survivor is, with the XP and the level it had: it lands or it is home, and it gained nothing (Issue-391).
    const alive = [...s.survivors, ...s.riders.map((hero) => ({ hero, xp: hero.xp, level: hero.level }))];
    const landsAlive = alive.filter(({ hero }) => landed.has(hero.id)).length;
    const leaveLiving = dead.length + landsAlive;
    const leaveActive = landed.size;
    /** Where a hero is after settlement: the destination if it lands, and home otherwise. */
    const at = (hero: Hero) => (landed.has(hero.id) ? destination : hero.location);
    const write = await this.service.transaction
      .write((items) => [
        on(
          AdventureClosed,
          items.open
            .delete({ playerId })
            .where((a, op) => op.eq(a.adventureId, adventureId))
            .commit(),
        ),
        on(
          AdventureClosed,
          items.adventure
            .update({ adventureId })
            // `replayOf` and `settledAt` are what the index's keys are made from (entities.ts).
            .set({ status: "SETTLED", result: s.result, settledAt: now.toISOString(), replayOf: s.jobId })
            .where((a, op) => op.eq(a.status, "OPEN"))
            .commit(),
        ),
        on(
          CampChanged,
          leaveLiving > 0 || leaveActive > 0
            ? items.camp
                .update({ playerId, location })
                .subtract({ livingHeroes: leaveLiving, activeHeroes: leaveActive })
                .where((a, op) => `${op.eq(a.warehouseLevel, warehouseLevel)} AND ${op.gte(a.livingHeroes, leaveLiving)} AND ${op.gte(a.activeHeroes, leaveActive)}`)
                .commit()
            : items.camp
                .check({ playerId, location })
                .where((a, op) => op.eq(a.warehouseLevel, warehouseLevel))
                .commit(),
        ),
        ...alive.flatMap(({ hero, xp, level }) => [
          on(
            HeroChanged,
            items.hero
              .update({ playerId, id: hero.id })
              .data((a, op) => {
                op.set(a.xp, xp);
                op.set(a.level, level);
                op.remove(a.adventureId);
                if (!landed.has(hero.id)) return;
                op.set(a.location, destination);
                op.ifNotExists(a.recruitedIn, hero.location);
              })
              .where((a, op) => op.eq(a.adventureId, adventureId))
              .commit(),
          ),
          on(HeroChanged, items.sighting.put(sightingOf({ ...hero, location: at(hero), xp, level }, now)).commit()),
          // A hero who lands is no longer seen at home (decision 0029).
          ...(landed.has(hero.id) ? [on(HeroChanged, items.sighting.delete({ location: hero.location, heroId: hero.id }).commit())] : []),
        ]),
        ...dead.flatMap((hero) => [
          on(
            HeroChanged,
            items.hero
              .update({ playerId, id: hero.id })
              .data((a, op) => {
                op.set(a.status, "DEAD");
                op.remove(a.adventureId);
                // A hero marked to stay lands dead, and counts at the destination as a dead hero counts at home.
                if (!landed.has(hero.id)) return;
                op.set(a.location, destination);
                op.ifNotExists(a.recruitedIn, hero.location);
              })
              .where((a, op) => `${op.eq(a.status, "ALIVE")} AND ${op.eq(a.adventureId, adventureId)}`)
              .commit(),
          ),
          // A dead hero has no sighting, at home or where it landed.
          on(HeroChanged, items.sighting.delete({ location: hero.location, heroId: hero.id }).commit()),
        ]),
        ...(s.caravan ? this.caravanSettleWrites(items, on, playerId, adventureId, s.caravan, landsAlive) : []),
        ...cappedCredits(items, on, playerId, adventureId, location, "credit", s.holdings),
        on(AdventureClosed, items.recent.put(recentOf(s, now)).commit()),
        ...s.result.unlocks.map((unlock) =>
          on(
            AdventureClosed,
            items.unlock
              .update({ playerId, unlock })
              .data((a, op) => {
                op.ifNotExists(a.earnedAt, now.toISOString());
                op.ifNotExists(a.adventureId, adventureId);
              })
              .commit(),
          ),
        ),
      ])
      .go();
    throwIfCancelled(write, failures);
  }

  /**
   * A caravan's writes at its destination in the settle transaction (decision
   * 0059). On an end that lands nobody, the slots held there are let go, on
   * the condition that the count covers them. On arrival the slots stay, as
   * the heroes who land now fill them, and the count of living heroes there
   * rises by those who live; each resource of a cargo that arrived is
   * credited up to the destination's cap on the condition that the balance
   * and the warehouse are those read, with a ledger entry `deliver` saying
   * the credit and what the cap lost. A destination that changes nothing
   * here takes no item of the transaction.
   */
  private caravanSettleWrites(
    items: TransactionItems,
    on: ReturnType<typeof failing>,
    playerId: string,
    adventureId: string,
    c: CaravanSettlement,
    landsAlive: number,
  ) {
    const location = c.destination;
    const delivering = c.deliveries.length > 0;
    const camp = (() => {
      if (c.released > 0) {
        return items.camp
          .update({ playerId, location })
          .subtract({ activeHeroes: c.released })
          .where((a, op) => op.gte(a.activeHeroes, c.released))
          .commit();
      }
      // The warehouse is held only where the cargo is credited; a camp with no item is at level 1.
      if (landsAlive > 0) {
        // The slots the start held made the item, so it is stored whenever someone lands.
        return items.camp
          .update({ playerId, location })
          .add({ livingHeroes: landsAlive })
          .where((a, op) => (delivering ? `${op.eq(a.warehouseLevel, c.warehouseLevel)} AND ${op.exists(a.activeHeroes)}` : op.exists(a.activeHeroes)))
          .commit();
      }
      if (delivering) return warehouseHeld(items, playerId, location, c.stored, c.warehouseLevel);
      return undefined;
    })();
    return [...(camp ? [on(CampChanged, camp)] : []), ...cappedCredits(items, on, playerId, adventureId, location, "deliver", c.deliveries)];
  }

  /**
   * Discard: close an open adventure with nothing credited (decision 0030).
   * The open item is deleted only if it is this adventure, the record marked
   * discarded only if it is still open and the caller's, and each hero's mark
   * removed only if it is this adventure's, so the party, and a caravan's
   * riders with it, is back at the camp as it set out. A caravan's cargo goes back to the origin's warehouse up
   * to its cap, each holding on the condition that its balance and the
   * warehouse are those read, with a ledger entry `return` saying what came
   * back and what the cap lost; the slots held at the destination are let go
   * (decision 0059). Throws AdventureClosed when the adventure has moved on,
   * and CampChanged when a balance or the warehouse moved since the read.
   */
  async discard(playerId: string, record: AdventureRecord, now = new Date(), returning?: CaravanReturn): Promise<void> {
    const { adventureId, location } = record;
    const staying = record.caravan?.staying.length ?? 0;
    const heroIds = marked(record);
    const failures: Failure[] = [];
    const on = failing(failures);
    const result = await this.service.transaction
      .write((items) => [
        on(
          AdventureClosed,
          items.open
            .delete({ playerId })
            .where((a, op) => op.eq(a.adventureId, adventureId))
            .commit(),
        ),
        on(
          AdventureClosed,
          items.adventure
            .update({ adventureId })
            .set({ status: "DISCARDED", discardedAt: now.toISOString() })
            .where((a, op) => `${op.eq(a.status, "OPEN")} AND ${op.eq(a.playerId, playerId)}`)
            .commit(),
        ),
        ...heroIds.map((id) =>
          on(
            HeroChanged,
            items.hero
              .update({ playerId, id })
              .remove(["adventureId"])
              .where((a, op) => op.eq(a.adventureId, adventureId))
              .commit(),
          ),
        ),
        ...(returning && returning.returns.length > 0
          ? [on(CampChanged, warehouseHeld(items, playerId, location, returning.stored, returning.warehouseLevel))]
          : []),
        ...cappedCredits(items, on, playerId, adventureId, location, "return", returning?.returns ?? []),
        ...(record.caravan && staying > 0
          ? [
              on(
                CampChanged,
                items.camp
                  .update({ playerId, location: record.caravan.destination })
                  .subtract({ activeHeroes: staying })
                  .where((a, op) => op.gte(a.activeHeroes, staying))
                  .commit(),
              ),
            ]
          : []),
      ])
      .go();
    throwIfCancelled(result, failures);
  }

  /**
   * Recruit, in one transaction (decision 0026): put the hero only if its id
   * is new; count it into the camp only if the hall is at the level read and
   * has a free slot, on the camp as the caller read it, so a concurrent
   * recruit, death or hall upgrade between the read and the write fails the
   * condition instead of passing the cap; and for each resource in the cost,
   * debit the holding only if its balance covers the amount, with a ledger
   * entry under the hero's id that can exist once. A camp with no item is
   * created at level 1. The hero is seen at its location as it is recruited
   * (decision 0029).
   *
   * `living` holds the price to the camp it was read from: a free villager
   * needs no living hero, a paid one at least one, so a death or a recruit
   * between the read and the write cannot make a villager free that was
   * charged, or charged that was free. A unit type whose price does not
   * depend on it passes "any".
   *
   * Where the camp's location needs an unlock, the transaction checks that
   * the player holds it (decision 0059).
   *
   * Throws HeroExists when the id is taken, which is a repeated request;
   * RecruitRefused when the camp's condition fails; InsufficientBalance when
   * a holding does not cover its debit; LocationLocked when the unlock is not
   * held.
   */
  async recruit(
    playerId: string,
    camp: Camp,
    capacity: number,
    hero: Hero,
    cost: Cost,
    living: "none" | "some" | "any",
  ): Promise<Hero> {
    const { location } = camp;
    const failures: Failure[] = [];
    const on = failing(failures);
    const result = await this.service.transaction
      .write((items) => [
        // A hero being recruited is neither retired nor on an adventure, which an absent attribute says.
        on(HeroExists, items.hero.create({ ...omit(hero, ["retiredAt", "adventureId"]), playerId }).commit()),
        on(
          RecruitRefused,
          items.camp
            .update({ playerId, location })
            .data((a, op) => {
              op.ifNotExists(a.hallLevel, 1);
              op.ifNotExists(a.warehouseLevel, 1);
              op.add(a.activeHeroes, 1);
              op.add(a.livingHeroes, 1);
            })
            .where((a, op) => {
              // No item is a camp at level 1 with no heroes, and every camp item has a hall level.
              if (!camp.stored) return op.notExists(a.hallLevel);
              const conditions = [op.eq(a.hallLevel, camp.hallLevel), op.lt(a.activeHeroes, capacity)];
              if (living === "none") conditions.push(op.eq(a.livingHeroes, 0));
              if (living === "some") conditions.push(op.gt(a.livingHeroes, 0));
              return conditions.join(" AND ");
            })
            .commit(),
        ),
        ...cost.flatMap(({ material, amount }) => [
          on(
            InsufficientBalance,
            items.holding
              .update({ playerId, location, material })
              .subtract({ balance: amount })
              .where((a, op) => op.gte(a.balance, amount))
              .commit(),
          ),
          // A ledger entry under the hero's id exists only if the hero does, so its failure is a repeat too.
          on(HeroExists, items.ledger.create({ playerId, cause: hero.id, entry: `debit#${material}`, location, material, delta: -amount }).commit()),
        ]),
        on(HeroExists, items.sighting.put(sightingOf(hero, new Date(hero.recruitedAt))).commit()),
        ...unlockHeld(items, playerId, location).map((check) => on(LocationLocked, check)),
      ])
      .go();
    throwIfCancelled(result, failures);
    return hero;
  }

  /**
   * Build one level of a facility, in one transaction (Issue-93, decision
   * 0032): set the facility's level to the next only if it is still the
   * level read, so two builds of one level charge once and a repeat fails;
   * check each facility it needs first is at its level or above; and for
   * each resource in the cost, debit the holding only if its balance covers
   * the amount, with a ledger entry under the build's cause that can exist
   * once. The hall's and the warehouse's levels are the camp's item, which
   * an absent camp creates at level 1 with no heroes; a requirement on the
   * item being built is folded into its own condition, since a transaction
   * touches an item once.
   *
   * Where the camp's location needs an unlock, the transaction checks that
   * the player holds it (decision 0059).
   *
   * Throws BuildRefused when the level or a requirement is not as read,
   * InsufficientBalance when a holding does not cover its debit, and
   * LocationLocked when the unlock is not held.
   */
  async build(playerId: string, camp: Camp, b: Build): Promise<void> {
    const { location } = camp;
    const level = b.from + 1;
    const onCamp = ON_CAMP[b.kind];
    // The requirements on the camp item itself, each as its attribute and the level it needs.
    const campChecks = b.requires.flatMap((r) => {
      const attribute = ON_CAMP[r.kind];
      return attribute && r.level > 1 ? [{ attribute, level: r.level }] : [];
    });
    const facilityChecks = b.requires.filter((r) => !ON_CAMP[r.kind]);
    // No item is a camp at level 1 with no heroes, which no requirement above level 1 is met by.
    if (onCamp && !camp.stored && campChecks.length > 0) throw new BuildRefused("a requirement is not met");
    const cause = buildCause(location, b.kind, level);
    const failures: Failure[] = [];
    const on = failing(failures);

    const result = await this.service.transaction
      .write((items) => {
        const levels = onCamp
          ? [
              on(
                BuildRefused,
                items.camp
                  .update({ playerId, location })
                  .data((a, op) => {
                    op.set(a[onCamp], level);
                    op.ifNotExists(onCamp === "hallLevel" ? a.warehouseLevel : a.hallLevel, 1);
                    op.ifNotExists(a.activeHeroes, 0);
                    op.ifNotExists(a.livingHeroes, 0);
                  })
                  .where((a, op) =>
                    camp.stored
                      ? [op.eq(a[onCamp], b.from), ...campChecks.map((check) => op.gte(a[check.attribute], check.level))].join(" AND ")
                      : op.notExists(a.hallLevel),
                  )
                  .commit(),
              ),
            ]
          : [
              on(
                BuildRefused,
                items.facility
                  .update({ playerId, location, kind: b.kind })
                  .set({ level })
                  .where((a, op) => (b.from === 0 ? op.notExists(a.level) : op.eq(a.level, b.from)))
                  .commit(),
              ),
              ...(campChecks.length > 0
                ? [
                    on(
                      BuildRefused,
                      items.camp
                        .check({ playerId, location })
                        .where((a, op) => campChecks.map((check) => op.gte(a[check.attribute], check.level)).join(" AND "))
                        .commit(),
                    ),
                  ]
                : []),
            ];
        return [
          ...levels,
          ...facilityChecks.map((r) =>
            on(
              BuildRefused,
              items.facility
                .check({ playerId, location, kind: r.kind })
                .where((a, op) => op.gte(a.level, r.level))
                .commit(),
            ),
          ),
          ...b.cost.flatMap(({ material, amount }) => [
            on(
              InsufficientBalance,
              items.holding
                .update({ playerId, location, material })
                .subtract({ balance: amount })
                .where((a, op) => op.gte(a.balance, amount))
                .commit(),
            ),
            // A ledger entry under the build's cause exists only if the level was built, so its failure is a repeat too.
            on(BuildRefused, items.ledger.create({ playerId, cause, entry: `debit#${material}`, location, material, delta: -amount }).commit()),
          ]),
          ...unlockHeld(items, playerId, location).map((check) => on(LocationLocked, check)),
        ];
      })
      .go();
    throwIfCancelled(result, failures);
  }

  /**
   * Retire: set the hero's status to retired only if it is still the status
   * the caller read and the hero is on no adventure, and count it out of the
   * camp: out of the active heroes, and out of the living ones if it was
   * alive. A concurrent retire, death, move or start between the read and
   * the write fails the hero's condition, so the counts change once. The camp's condition keeps a count from going
   * below zero. The hero's sighting is deleted, so it leaves other players'
   * camps at once (decision 0029). Throws HeroChanged when either condition
   * fails.
   */
  async retire(playerId: string, hero: Hero, now = new Date()): Promise<Hero> {
    const retiredAt = now.toISOString();
    const alive = hero.status === "ALIVE";
    const failures: Failure[] = [];
    const on = failing(failures);
    const result = await this.service.transaction
      .write((items) => [
        on(
          HeroChanged,
          items.hero
            .update({ playerId, id: hero.id })
            .set({ status: "RETIRED", retiredAt })
            .where((a, op) => `${op.eq(a.status, hero.status)} AND ${op.eq(a.location, hero.location)} AND NOT ${op.type(a.adventureId, "S")}`)
            .commit(),
        ),
        on(
          HeroChanged,
          items.camp
            .update({ playerId, location: hero.location })
            .subtract({ activeHeroes: 1, ...(alive ? { livingHeroes: 1 } : {}) })
            .where((a, op) => (alive ? `${op.gt(a.activeHeroes, 0)} AND ${op.gt(a.livingHeroes, 0)}` : op.gt(a.activeHeroes, 0)))
            .commit(),
        ),
        on(HeroChanged, items.sighting.delete({ location: hero.location, heroId: hero.id }).commit()),
      ])
      .go();
    throwIfCancelled(result, failures);
    return { ...hero, status: "RETIRED", retiredAt };
  }

  /**
   * One window of a location's sightings, in key order: from a point to the
   * end of the collection, or from its start to just before a point. Reads
   * at most `limit` items and says how many it read; the filter on expiry
   * runs after the limit, so an expired item counts towards it, which is
   * what keeps a sample's read bounded (decision 0029). `limit` is DynamoDB's
   * Limit, and only a raw read says how many it scanned (decision 0041). The
   * upper bound `g` stands above every hex hero id.
   */
  async sightings(
    location: string,
    window: { from: string } | { before: string },
    limit: number,
    now = new Date(),
  ): Promise<{ sightings: Sighting[]; read: number }> {
    const { sighting } = this.service.entities;
    const seconds = Math.floor(now.getTime() / 1000);
    const [lo, hi] = "from" in window ? [window.from, "g"] : ["", window.before];
    const page = rawPage(
      await sighting.query
        .primary({ location })
        .between({ heroId: lo }, { heroId: hi })
        .where((a, op) => op.gt(a.expiresAt, seconds))
        .go({ limit, data: "raw" }),
    );
    return { sightings: sighting.parse({ Items: page.Items }).data.map(toSighting), read: page.ScannedCount };
  }

  /**
   * The adventures most recently settled at a location, newest first: one
   * Query of its `DONE#` items in descending key order, which is time order,
   * reading at most `limit`. The filter on expiry runs after the limit, so
   * the read never passes it (decision 0050). Strongly consistent, so a
   * player who has just settled finds the adventure in the list.
   */
  async recentAdventures(location: string, limit: number, now = new Date()): Promise<RecentAdventure[]> {
    const seconds = Math.floor(now.getTime() / 1000);
    const { data } = await this.service.entities.recent.query
      .primary({ location })
      .where((a, op) => op.gt(a.expiresAt, seconds))
      .go({ ...STRONG, order: "desc", limit });
    return data;
  }

  /**
   * The settled adventures of a job, newest first: one Query of GSI1 on
   * `JOB#<jobId>` in descending key order, which is the order they settled
   * in, reading at most `limit` (decision 0050). Eventually consistent, as
   * every read of a global secondary index is, so an adventure may be
   * missing for a moment after it settles.
   */
  async replays(jobId: string, limit: number): Promise<AdventureRecord[]> {
    const { data } = await this.service.entities.adventure.query.replays({ replayOf: jobId }).go({ order: "desc", limit });
    return data.map(toAdventure);
  }

  /** The player's `AT#` items, raw, every page: a raw read answers one page whatever `pages` says. */
  private async atItems(playerId: string): Promise<RawItem[]> {
    const query = this.service.entities.camp.query.primary({ playerId });
    const items: RawItem[] = [];
    let start: RawPage["LastEvaluatedKey"];
    do {
      // ElectroDB takes a raw page's LastEvaluatedKey back as `cursor` as it is, though it types a cursor a string.
      const cursor = (start ?? null) as unknown as string | null;
      const page: RawPage = rawPage(await query.go({ ...STRONG, ignoreOwnership: true, data: "raw", cursor }));
      items.push(...page.Items);
      start = page.LastEvaluatedKey;
    } while (start);
    return items;
  }
}
