import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { EntityItem } from "electrodb";
import { omit, range } from "es-toolkit";

import {
  type AdventureOutcome,
  type AdventureSnapshot,
  type Cost,
  type FacilityKind,
  type Material,
  must,
  type Requirement,
  type Reward,
  type StageResult,
  STARTING_LOCATION,
  type UnitType,
} from "@heat/engine";

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
 * Start and settle write to both tables in one transaction: the player's
 * open item and ledger in the player table, the adventure record in the
 * location table. Recruit and retire do too, for the hero's sighting at its
 * location (decision 0029). TransactWriteItems spans tables in one account and
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

export interface Player {
  id: string;
  name: string;
}

export interface Holding {
  material: Material;
  balance: number;
}

/**
 * A camp: one player's view of one location (decision 0026). A camp with no
 * item is the starting location at level 1 with no heroes; `stored` says
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
  location: string;
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
  result?: SettledResult | undefined;
  settledAt?: string | undefined;
  discardedAt?: string | undefined;
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
 * warehouse took and what its cap lost, and each hero's XP, level and fate.
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
}

/**
 * Settlement's writes, computed by the caller from what it read: the camp's
 * warehouse level, each holding's balance (null where there is no item yet)
 * and what goes into it, each survivor's new XP and level, and the dead.
 */
export interface Settlement {
  adventureId: string;
  location: string;
  warehouseLevel: number;
  holdings: { material: Material; read: number | null; credit: number; lost: number }[];
  survivors: { hero: Hero; xp: number; level: number }[];
  dead: Hero[];
  result: SettledResult;
}
type Failure = new (message: string) => Error;

/** An item as DynamoDB answers it, which a raw read gives with its keys. */
type RawItem = { SK: string } & Record<string, unknown>;

/**
 * What a read with `data: "raw"` answers, whatever `go`'s type says: one
 * DynamoDB page, whatever `pages` says. ElectroDB takes the page's
 * LastEvaluatedKey back as `cursor` as it is, though it types a cursor a string.
 */
interface RawPage {
  Items: RawItem[];
  ScannedCount: number;
  LastEvaluatedKey?: string;
}

function rawPage(response: { data: unknown }): RawPage {
  return response.data as RawPage;
}

/**
 * Every read takes `ignoreOwnership`, so that it finds an item from before
 * ElectroDB, by its keys, until the backfill has made them whole (decision
 * 0041; Issue-213 takes it off).
 */
const STRONG = { consistent: true, ignoreOwnership: true } as const;
const FROM_BEFORE = { ignoreOwnership: true } as const;

function toSighting(i: EntityItem<HeatService["entities"]["sighting"]>): Sighting {
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

function toHero(i: EntityItem<HeatService["entities"]["hero"]>): Hero {
  return {
    id: i.id,
    location: i.location,
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
   * The profile on first sign-in: written if absent, left alone if present,
   * in one call, so a repeat or a race between two tabs is harmless.
   */
  async joinPlayer(player: Player): Promise<Player> {
    const { data } = await this.service.entities.profile
      .update({ id: player.id })
      .data((a, op) => {
        op.ifNotExists(a.name, player.name);
      })
      .go({ response: "all_new" });
    return { id: player.id, name: must(data.name, "the profile's name") };
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const { data } = await this.service.entities.profile.get({ id }).go(STRONG);
    return data ? { id: data.id, name: data.name } : undefined;
  }

  async setBalance(playerId: string, location: string, material: Material, balance: number): Promise<void> {
    await this.service.entities.holding.put({ playerId, location, material, balance }).go();
  }

  /**
   * Every camp of the player, with its holdings, from one Query of the
   * `AT#` items (decision 0026). The starting location is always a camp, item
   * or not. The location is read from the sort key, because an item from
   * before ElectroDB may not hold it, and the query keeps `ignoreOwnership` for
   * good: without it, it is filtered to camps alone (decision 0041).
   */
  async camps(playerId: string): Promise<Camp[]> {
    const { camp: campEntity, facility: facilityEntity, holding: holdingEntity } = this.service.entities;
    const camps = new Map<string, Camp>([[STARTING_LOCATION, emptyCamp(STARTING_LOCATION)]]);
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
        const i = must(campEntity.parse({ Item: item }, FROM_BEFORE).data, "a camp's item");
        Object.assign(camp, {
          hallLevel: i.hallLevel ?? 1,
          warehouseLevel: i.warehouseLevel ?? 1,
          activeHeroes: i.activeHeroes ?? 0,
          livingHeroes: i.livingHeroes ?? 0,
          stored: true,
        });
      } else if (kind === "HOLDING") {
        const i = must(holdingEntity.parse({ Item: item }, FROM_BEFORE).data, "a holding's item");
        camp.holdings.push({ material: i.material, balance: i.balance });
      } else if (kind === "FACILITY") {
        const i = must(facilityEntity.parse({ Item: item }, FROM_BEFORE).data, "a facility's item");
        camp.facilities[i.kind] = i.level;
      }
    }
    return [...camps.values()];
  }

  async camp(playerId: string, location: string): Promise<Camp> {
    return (await this.camps(playerId)).find((c) => c.location === location) ?? emptyCamp(location);
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
    return data ?? undefined;
  }

  /**
   * Start: write the open-adventure item only if the player has none, the
   * adventure record only if the id is new, and mark each hero of the party
   * with the adventure's id only if it is still alive, at the adventure's
   * location and on no adventure, so a retire, a death or a move that races
   * the start fails one side or the other; and check that each facility the
   * job needs, the one that posts it, is built at its level or above
   * (Issue-133). Throws AdventureAlreadyOpen when the first condition fails,
   * HeroChanged when a hero's does and FacilityMissing when a facility's does.
   * A job's facility is one a camp builds, so it has an item of its own.
   */
  async startAdventure(
    playerId: string,
    record: Omit<AdventureRecord, "playerId" | "status">,
    needs: readonly Requirement[] = [],
  ): Promise<AdventureRecord> {
    const started: AdventureRecord = { ...record, playerId, status: "OPEN" };
    const { adventureId, seed, startedAt, location } = record;
    const heroIds = record.snapshot.heroes.map((h) => h.heroId);
    const result = await this.service.transaction
      .write((items) => [
        items.open.create({ playerId, adventureId, seed, startedAt }).commit(),
        // A record being started has no result and no end, which an absent attribute says.
        items.adventure.create(omit(started, ["result", "settledAt", "discardedAt"])).commit(),
        ...heroIds.map((id) =>
          items.hero
            .update({ playerId, id })
            .set({ adventureId })
            // True of a hero on no adventure: no adventureId attribute, or a null one, which a hero item written whole would carry.
            .where((a, op) => `${op.eq(a.status, "ALIVE")} AND ${op.eq(a.location, location)} AND NOT ${op.type(a.adventureId, "S")}`)
            .commit(),
        ),
        ...needs.map((r) =>
          items.facility
            .check({ playerId, location, kind: r.kind })
            .where((a, op) => op.gte(a.level, r.level))
            .commit(),
        ),
      ])
      .go();
    throwIfCancelled(result, [AdventureAlreadyOpen, AlreadyApplied, ...heroIds.map(() => HeroChanged), ...needs.map(() => FacilityMissing)]);
    return started;
  }

  /**
   * Debit: reduce a holding only if the balance covers it, and record the
   * ledger entry only once per cause and material. Throws
   * InsufficientBalance or AlreadyApplied.
   */
  async debit(playerId: string, location: string, causeId: string, material: Material, amount: number): Promise<void> {
    if (amount <= 0) throw new RangeError("amount must be positive");
    const result = await this.service.transaction
      .write((items) => [
        items.holding
          .update({ playerId, location, material })
          .subtract({ balance: amount })
          .where((a, op) => op.gte(a.balance, amount))
          .commit(),
        items.ledger.create({ playerId, cause: causeId, entry: `debit#${material}`, location, material, delta: -amount }).commit(),
      ])
      .go();
    throwIfCancelled(result, [InsufficientBalance, AlreadyApplied]);
  }

  /**
   * Settle, in one transaction (decision 0014; overview, "Camps, heroes and
   * resources"): the open item deleted only if it is this adventure; the
   * record marked settled with its result only if it is still open; the
   * camp's warehouse level checked against the one the cap was computed
   * from, and its living count decremented by the dead only if it covers
   * them; each survivor's XP and level set and its mark removed, and its
   * sighting refreshed; each dead hero set dead only if it was alive, its
   * mark removed and its sighting deleted (decision 0029); each holding
   * written with its capped credit only if its balance is still the one
   * read, with a ledger entry per material that can exist once and records
   * what the cap lost. Every hero's write is conditioned on its mark being
   * this adventure's.
   *
   * Throws AdventureClosed when the open item or the record has moved on,
   * which is a repeat or a race with a discard; CampChanged when a balance
   * or the warehouse moved between the caller's read and this write, for the
   * caller to read again; HeroChanged when a hero is no longer on this
   * adventure, which nothing should do.
   */
  async settle(playerId: string, s: Settlement, now = new Date()): Promise<void> {
    const { adventureId, location, warehouseLevel, dead } = s;
    const write = await this.service.transaction
      .write((items) => [
        items.open
          .delete({ playerId })
          .where((a, op) => op.eq(a.adventureId, adventureId))
          .commit(),
        items.adventure
          .update({ adventureId })
          .set({ status: "SETTLED", result: s.result, settledAt: now.toISOString() })
          .where((a, op) => op.eq(a.status, "OPEN"))
          .commit(),
        dead.length > 0
          ? items.camp
              .update({ playerId, location })
              .subtract({ livingHeroes: dead.length })
              .where((a, op) => `${op.eq(a.warehouseLevel, warehouseLevel)} AND ${op.gte(a.livingHeroes, dead.length)}`)
              .commit()
          : items.camp
              .check({ playerId, location })
              .where((a, op) => op.eq(a.warehouseLevel, warehouseLevel))
              .commit(),
        ...s.survivors.flatMap(({ hero, xp, level }) => [
          items.hero
            .update({ playerId, id: hero.id })
            .set({ xp, level })
            .remove(["adventureId"])
            .where((a, op) => op.eq(a.adventureId, adventureId))
            .commit(),
          items.sighting.put(sightingOf({ ...hero, xp, level }, now)).commit(),
        ]),
        ...dead.flatMap((hero) => [
          items.hero
            .update({ playerId, id: hero.id })
            .set({ status: "DEAD" })
            .remove(["adventureId"])
            .where((a, op) => `${op.eq(a.status, "ALIVE")} AND ${op.eq(a.adventureId, adventureId)}`)
            .commit(),
          items.sighting.delete({ location: hero.location, heroId: hero.id }).commit(),
        ]),
        ...s.holdings.flatMap(({ material, read, credit, lost }) => [
          ...(credit > 0
            ? [
                items.holding
                  .update({ playerId, location, material })
                  .set({ balance: (read ?? 0) + credit })
                  .where((a, op) => (read === null ? op.notExists(a.balance) : op.eq(a.balance, read)))
                  .commit(),
              ]
            : []),
          items.ledger.create({ playerId, cause: adventureId, entry: `credit#${material}`, location, material, delta: credit, lost }).commit(),
        ]),
      ])
      .go();
    throwIfCancelled(write, [
      AdventureClosed,
      AdventureClosed,
      CampChanged,
      ...s.survivors.flatMap(() => [HeroChanged, HeroChanged]),
      ...dead.flatMap(() => [HeroChanged, HeroChanged]),
      ...s.holdings.flatMap((h) => (h.credit > 0 ? [CampChanged, AdventureClosed] : [AdventureClosed])),
    ]);
  }

  /**
   * Discard: close an open adventure with nothing credited (decision 0030).
   * The open item is deleted only if it is this adventure, the record marked
   * discarded only if it is still open and the caller's, and each hero's mark
   * removed only if it is this adventure's, so the party is back at the camp
   * as it set out. Throws AdventureClosed when the adventure has moved on.
   */
  async discard(playerId: string, record: AdventureRecord, now = new Date()): Promise<void> {
    const { adventureId } = record;
    const heroIds = record.snapshot.heroes.map((h) => h.heroId);
    const result = await this.service.transaction
      .write((items) => [
        items.open
          .delete({ playerId })
          .where((a, op) => op.eq(a.adventureId, adventureId))
          .commit(),
        items.adventure
          .update({ adventureId })
          .set({ status: "DISCARDED", discardedAt: now.toISOString() })
          .where((a, op) => `${op.eq(a.status, "OPEN")} AND ${op.eq(a.playerId, playerId)}`)
          .commit(),
        ...heroIds.map((id) =>
          items.hero
            .update({ playerId, id })
            .remove(["adventureId"])
            .where((a, op) => op.eq(a.adventureId, adventureId))
            .commit(),
        ),
      ])
      .go();
    throwIfCancelled(result, [AdventureClosed, AdventureClosed, ...heroIds.map(() => HeroChanged)]);
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
   * Throws HeroExists when the id is taken, which is a repeated request;
   * RecruitRefused when the camp's condition fails; InsufficientBalance when
   * a holding does not cover its debit.
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
    const result = await this.service.transaction
      .write((items) => [
        // A hero being recruited is neither retired nor on an adventure, which an absent attribute says.
        items.hero.create({ ...omit(hero, ["retiredAt", "adventureId"]), playerId }).commit(),
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
        ...cost.flatMap(({ material, amount }) => [
          items.holding
            .update({ playerId, location, material })
            .subtract({ balance: amount })
            .where((a, op) => op.gte(a.balance, amount))
            .commit(),
          items.ledger.create({ playerId, cause: hero.id, entry: `debit#${material}`, location, material, delta: -amount }).commit(),
        ]),
        items.sighting.put(sightingOf(hero, new Date(hero.recruitedAt))).commit(),
      ])
      .go();
    // A ledger entry under the hero's id exists only if the hero does, so its failure is a repeat too.
    throwIfCancelled(result, [HeroExists, RecruitRefused, ...cost.flatMap(() => [InsufficientBalance, HeroExists])]);
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
   * Throws BuildRefused when the level or a requirement is not as read, and
   * InsufficientBalance when a holding does not cover its debit.
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

    const result = await this.service.transaction
      .write((items) => {
        const levels = onCamp
          ? [
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
            ]
          : [
              items.facility
                .update({ playerId, location, kind: b.kind })
                .set({ level })
                .where((a, op) => (b.from === 0 ? op.notExists(a.level) : op.eq(a.level, b.from)))
                .commit(),
              ...(campChecks.length > 0
                ? [
                    items.camp
                      .check({ playerId, location })
                      .where((a, op) => campChecks.map((check) => op.gte(a[check.attribute], check.level)).join(" AND "))
                      .commit(),
                  ]
                : []),
            ];
        return [
          ...levels,
          ...facilityChecks.map((r) =>
            items.facility
              .check({ playerId, location, kind: r.kind })
              .where((a, op) => op.gte(a.level, r.level))
              .commit(),
          ),
          ...b.cost.flatMap(({ material, amount }) => [
            items.holding
              .update({ playerId, location, material })
              .subtract({ balance: amount })
              .where((a, op) => op.gte(a.balance, amount))
              .commit(),
            items.ledger.create({ playerId, cause, entry: `debit#${material}`, location, material, delta: -amount }).commit(),
          ]),
        ];
      })
      .go();
    const checks = (onCamp ? 1 : campChecks.length > 0 ? 2 : 1) + facilityChecks.length;
    // A ledger entry under the build's cause exists only if the level was built, so its failure is a repeat too.
    throwIfCancelled(result, [...range(checks).map(() => BuildRefused), ...b.cost.flatMap(() => [InsufficientBalance, BuildRefused])]);
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
    const result = await this.service.transaction
      .write((items) => [
        items.hero
          .update({ playerId, id: hero.id })
          .set({ status: "RETIRED", retiredAt })
          .where((a, op) => `${op.eq(a.status, hero.status)} AND ${op.eq(a.location, hero.location)} AND NOT ${op.type(a.adventureId, "S")}`)
          .commit(),
        items.camp
          .update({ playerId, location: hero.location })
          .subtract({ activeHeroes: 1, ...(alive ? { livingHeroes: 1 } : {}) })
          .where((a, op) => (alive ? `${op.gt(a.activeHeroes, 0)} AND ${op.gt(a.livingHeroes, 0)}` : op.gt(a.activeHeroes, 0)))
          .commit(),
        items.sighting.delete({ location: hero.location, heroId: hero.id }).commit(),
      ])
      .go();
    throwIfCancelled(result, [HeroChanged, HeroChanged]);
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
        .go({ limit, ignoreOwnership: true, data: "raw" }),
    );
    return { sightings: sighting.parse({ Items: page.Items }, FROM_BEFORE).data.map(toSighting), read: page.ScannedCount };
  }

  /** The player's `AT#` items, raw, every page: a raw read answers one page whatever `pages` says. */
  private async atItems(playerId: string): Promise<RawItem[]> {
    const query = this.service.entities.camp.query.primary({ playerId });
    const items: RawItem[] = [];
    let cursor: string | null = null;
    do {
      const page: RawPage = rawPage(await query.go({ ...STRONG, data: "raw", cursor }));
      items.push(...page.Items);
      cursor = page.LastEvaluatedKey ?? null;
    } while (cursor);
    return items;
  }
}
