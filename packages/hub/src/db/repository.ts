import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import {
  STARTING_LOCATION,
  type AdventureOutcome,
  type AdventureSnapshot,
  type Cost,
  type FacilityKind,
  type Material,
  type Requirement,
  type Reward,
  type StageResult,
  type UnitType,
} from "@heat/engine";
import { sightingOf, type Sighting } from "../seen.js";
import type { Tables } from "./client.js";
import { locationKeys, playerKeys } from "./keys.js";

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
  material: string;
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

export type HeroStatus = "ALIVE" | "DEAD" | "RETIRED";

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
  result?: SettledResult;
  settledAt?: string;
  discardedAt?: string;
}

export type AdventureStatus = "OPEN" | "SETTLED" | "DISCARDED";

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

type TransactItems = NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]>;
type Item = Record<string, unknown>;

function toSighting(i: Item): Sighting {
  return {
    heroId: i["heroId"] as string,
    location: i["location"] as string,
    name: i["name"] as string,
    unitType: i["unitType"] as UnitType,
    spriteSet: i["spriteSet"] as string,
    level: (i["level"] as number | undefined) ?? 1,
    seenAt: i["seenAt"] as string,
    expiresAt: i["expiresAt"] as number,
  };
}

function emptyCamp(location: string): Camp {
  return { location, hallLevel: 1, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0, holdings: [], facilities: {}, stored: false };
}

function toHero(i: Item): Hero {
  return {
    id: i["id"] as string,
    location: i["location"] as string,
    unitType: i["unitType"] as UnitType,
    spriteSet: i["spriteSet"] as string,
    name: i["name"] as string,
    recruitedAt: i["recruitedAt"] as string,
    level: (i["level"] as number | undefined) ?? 1,
    xp: (i["xp"] as number | undefined) ?? 0,
    picks: (i["picks"] as string[] | undefined) ?? [],
    status: (i["status"] as HeroStatus | undefined) ?? "ALIVE",
    retiredAt: (i["retiredAt"] as string | undefined) ?? null,
    adventureId: (i["adventureId"] as string | undefined) ?? null,
  };
}

/**
 * A hero's item as written: a hero on no adventure has no adventureId
 * attribute at all.
 */
function heroItem(hero: Hero): Item {
  const { adventureId, ...rest } = hero;
  return adventureId === null ? rest : { ...rest, adventureId };
}

/**
 * True of a hero on no adventure: no adventureId attribute, or a null one,
 * which a hero item written whole with `adventureId: null` would carry.
 * Needs `:string` bound to "S".
 */
const AT_CAMP = "NOT attribute_type(adventureId, :string)";

export class Repository {
  constructor(
    private readonly db: DynamoDBDocumentClient,
    private readonly tables: Tables,
  ) {}

  async putPlayer(player: Player): Promise<void> {
    await this.db.send(
      new PutCommand({ TableName: this.tables.player, Item: { ...playerKeys.profile(player.id), ...player } }),
    );
  }

  /**
   * The profile on first sign-in: written if absent, left alone if present,
   * in one call, so a repeat or a race between two tabs is harmless.
   */
  async joinPlayer(player: Player): Promise<Player> {
    const r = await this.db.send(
      new UpdateCommand({
        TableName: this.tables.player,
        Key: playerKeys.profile(player.id),
        UpdateExpression: "SET id = :id, #name = if_not_exists(#name, :name)",
        ExpressionAttributeNames: { "#name": "name" },
        ExpressionAttributeValues: { ":id": player.id, ":name": player.name },
        ReturnValues: "ALL_NEW",
      }),
    );
    return { id: r.Attributes?.["id"], name: r.Attributes?.["name"] };
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    const r = await this.db.send(new GetCommand({ TableName: this.tables.player, Key: playerKeys.profile(id) }));
    return r.Item ? { id: r.Item["id"], name: r.Item["name"] } : undefined;
  }

  async setBalance(playerId: string, location: string, material: string, balance: number): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tables.player,
        Item: { ...playerKeys.holding(playerId, location, material), material, balance },
      }),
    );
  }

  /**
   * Every camp of the player, with its holdings, from one Query of the
   * `AT#` items. The starting location is always a camp, item or not.
   */
  async camps(playerId: string): Promise<Camp[]> {
    const items = await this.query(playerId, "AT#");
    const camps = new Map<string, Camp>([[STARTING_LOCATION, emptyCamp(STARTING_LOCATION)]]);
    const campAt = (location: string) => {
      let camp = camps.get(location);
      if (!camp) camps.set(location, (camp = emptyCamp(location)));
      return camp;
    };
    for (const i of items) {
      const [, location, kind, facility] = (i["SK"] as string).split("#");
      if (!location) continue;
      const camp = campAt(location);
      if (kind === "CAMP") {
        Object.assign(camp, {
          hallLevel: i["hallLevel"] ?? 1,
          warehouseLevel: i["warehouseLevel"] ?? 1,
          activeHeroes: i["activeHeroes"] ?? 0,
          livingHeroes: i["livingHeroes"] ?? 0,
          stored: true,
        });
      } else if (kind === "HOLDING") {
        camp.holdings.push({ material: i["material"] as string, balance: i["balance"] as number });
      } else if (kind === "FACILITY" && facility) {
        camp.facilities[facility as FacilityKind] = i["level"] as number;
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
    return (await this.query(playerId, "HERO#")).map(toHero);
  }

  async getHero(playerId: string, heroId: string): Promise<Hero | undefined> {
    const r = await this.db.send(new GetCommand({ TableName: this.tables.player, Key: playerKeys.hero(playerId, heroId) }));
    return r.Item ? toHero(r.Item) : undefined;
  }

  async openAdventure(playerId: string): Promise<OpenAdventure | undefined> {
    const r = await this.db.send(new GetCommand({ TableName: this.tables.player, Key: playerKeys.open(playerId) }));
    return r.Item
      ? { adventureId: r.Item["adventureId"], seed: r.Item["seed"], startedAt: r.Item["startedAt"] }
      : undefined;
  }

  async getAdventure(adventureId: string): Promise<AdventureRecord | undefined> {
    const r = await this.db.send(
      new GetCommand({ TableName: this.tables.location, Key: locationKeys.adventure(adventureId) }),
    );
    if (!r.Item) return undefined;
    const { PK: _pk, SK: _sk, ...record } = r.Item;
    return record as AdventureRecord;
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
    const open: OpenAdventure = { adventureId: record.adventureId, seed: record.seed, startedAt: record.startedAt };
    const heroIds = record.snapshot.heroes.map((h) => h.heroId);
    await this.transact([
      {
        Put: {
          TableName: this.tables.player,
          Item: { ...playerKeys.open(playerId), ...open },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Put: {
          TableName: this.tables.location,
          Item: { ...locationKeys.adventure(record.adventureId), ...started },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      ...heroIds.map((heroId) => ({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.hero(playerId, heroId),
          UpdateExpression: "SET adventureId = :id",
          ConditionExpression: `#s = :alive AND #location = :location AND ${AT_CAMP}`,
          ExpressionAttributeNames: { "#s": "status", "#location": "location" },
          ExpressionAttributeValues: { ":id": record.adventureId, ":alive": "ALIVE", ":location": record.location, ":string": "S" },
        },
      })),
      ...needs.map((r) => ({
        ConditionCheck: {
          TableName: this.tables.player,
          Key: playerKeys.facility(playerId, record.location, r.kind),
          ConditionExpression: "#level >= :need",
          ExpressionAttributeNames: { "#level": "level" },
          ExpressionAttributeValues: { ":need": r.level },
        },
      })),
    ], [AdventureAlreadyOpen, AlreadyApplied, ...heroIds.map(() => HeroChanged), ...needs.map(() => FacilityMissing)]);
    return started;
  }

  /**
   * Debit: reduce a holding only if the balance covers it, and record the
   * ledger entry only once per cause and material. Throws
   * InsufficientBalance or AlreadyApplied.
   */
  async debit(playerId: string, location: string, causeId: string, material: string, amount: number): Promise<void> {
    if (amount <= 0) throw new RangeError("amount must be positive");
    await this.transact([
      {
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.holding(playerId, location, material),
          UpdateExpression: "SET balance = balance - :amount",
          ConditionExpression: "balance >= :amount",
          ExpressionAttributeValues: { ":amount": amount },
        },
      },
      {
        Put: {
          TableName: this.tables.player,
          Item: { ...playerKeys.ledger(playerId, causeId, `debit#${material}`), location, material, delta: -amount },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ], [InsufficientBalance, AlreadyApplied]);
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
    const items: TransactItems = [];
    const failures: (new (message: string) => Error)[] = [];
    const add = (item: TransactItems[number], failure: new (message: string) => Error) => {
      items.push(item);
      failures.push(failure);
    };

    add({
      Delete: {
        TableName: this.tables.player,
        Key: playerKeys.open(playerId),
        ConditionExpression: "adventureId = :id",
        ExpressionAttributeValues: { ":id": s.adventureId },
      },
    }, AdventureClosed);
    add({
      Update: {
        TableName: this.tables.location,
        Key: locationKeys.adventure(s.adventureId),
        UpdateExpression: "SET #s = :settled, #result = :result, settledAt = :at",
        ConditionExpression: "attribute_exists(PK) AND #s = :open",
        ExpressionAttributeNames: { "#s": "status", "#result": "result" },
        ExpressionAttributeValues: { ":settled": "SETTLED", ":open": "OPEN", ":result": s.result, ":at": now.toISOString() },
      },
    }, AdventureClosed);

    const camp = playerKeys.camp(playerId, s.location);
    if (s.dead.length > 0) {
      add({
        Update: {
          TableName: this.tables.player,
          Key: camp,
          UpdateExpression: "ADD livingHeroes :less",
          ConditionExpression: "warehouseLevel = :wl AND livingHeroes >= :dead",
          ExpressionAttributeValues: { ":less": -s.dead.length, ":dead": s.dead.length, ":wl": s.warehouseLevel },
        },
      }, CampChanged);
    } else {
      add({
        ConditionCheck: {
          TableName: this.tables.player,
          Key: camp,
          ConditionExpression: "warehouseLevel = :wl",
          ExpressionAttributeValues: { ":wl": s.warehouseLevel },
        },
      }, CampChanged);
    }

    for (const { hero, xp, level } of s.survivors) {
      add({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.hero(playerId, hero.id),
          UpdateExpression: "SET xp = :xp, #level = :level REMOVE adventureId",
          ConditionExpression: "adventureId = :id",
          ExpressionAttributeNames: { "#level": "level" },
          ExpressionAttributeValues: { ":xp": xp, ":level": level, ":id": s.adventureId },
        },
      }, HeroChanged);
      add({
        Put: {
          TableName: this.tables.location,
          Item: { ...locationKeys.seen(hero.location, hero.id), ...sightingOf({ ...hero, xp, level }, now) },
        },
      }, HeroChanged);
    }
    for (const hero of s.dead) {
      add({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.hero(playerId, hero.id),
          UpdateExpression: "SET #s = :dead REMOVE adventureId",
          ConditionExpression: "#s = :alive AND adventureId = :id",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":dead": "DEAD", ":alive": "ALIVE", ":id": s.adventureId },
        },
      }, HeroChanged);
      add({ Delete: { TableName: this.tables.location, Key: locationKeys.seen(hero.location, hero.id) } }, HeroChanged);
    }

    for (const h of s.holdings) {
      if (h.credit > 0) {
        add({
          Update: {
            TableName: this.tables.player,
            Key: playerKeys.holding(playerId, s.location, h.material),
            UpdateExpression: "SET material = :m, balance = :balance",
            ConditionExpression: h.read === null ? "attribute_not_exists(PK)" : "balance = :read",
            ExpressionAttributeValues: {
              ":m": h.material,
              ":balance": (h.read ?? 0) + h.credit,
              ...(h.read === null ? {} : { ":read": h.read }),
            },
          },
        }, CampChanged);
      }
      add({
        Put: {
          TableName: this.tables.player,
          Item: {
            ...playerKeys.ledger(playerId, s.adventureId, `credit#${h.material}`),
            location: s.location,
            material: h.material,
            delta: h.credit,
            lost: h.lost,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      }, AdventureClosed);
    }

    await this.transact(items, failures);
  }

  /**
   * Discard: close an open adventure with nothing credited (decision 0030).
   * The open item is deleted only if it is this adventure, the record marked
   * discarded only if it is still open and the caller's, and each hero's mark
   * removed only if it is this adventure's, so the party is back at the camp
   * as it set out. Throws AdventureClosed when the adventure has moved on.
   */
  async discard(playerId: string, record: AdventureRecord, now = new Date()): Promise<void> {
    const heroIds = record.snapshot.heroes.map((h) => h.heroId);
    await this.transact([
      {
        Delete: {
          TableName: this.tables.player,
          Key: playerKeys.open(playerId),
          ConditionExpression: "adventureId = :id",
          ExpressionAttributeValues: { ":id": record.adventureId },
        },
      },
      {
        Update: {
          TableName: this.tables.location,
          Key: locationKeys.adventure(record.adventureId),
          UpdateExpression: "SET #s = :discarded, discardedAt = :at",
          ConditionExpression: "attribute_exists(PK) AND #s = :open AND playerId = :player",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":discarded": "DISCARDED", ":open": "OPEN", ":player": playerId, ":at": now.toISOString() },
        },
      },
      ...heroIds.map((heroId) => ({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.hero(playerId, heroId),
          UpdateExpression: "REMOVE adventureId",
          ConditionExpression: "adventureId = :id",
          ExpressionAttributeValues: { ":id": record.adventureId },
        },
      })),
    ], [AdventureClosed, AdventureClosed, ...heroIds.map(() => HeroChanged)]);
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
    const values: Record<string, unknown> = { ":one": 1, ":location": camp.location };
    const conditions = ["hallLevel = :level", "activeHeroes < :cap"];
    if (living === "none") conditions.push("livingHeroes = :zero");
    if (living === "some") conditions.push("livingHeroes > :zero");
    if (camp.stored) {
      Object.assign(values, { ":level": camp.hallLevel, ":cap": capacity });
      if (living !== "any") values[":zero"] = 0;
    }
    const debits: TransactItems = cost.flatMap(({ material, amount }) => [
      {
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.holding(playerId, camp.location, material),
          UpdateExpression: "SET balance = balance - :amount",
          ConditionExpression: "balance >= :amount",
          ExpressionAttributeValues: { ":amount": amount },
        },
      },
      {
        Put: {
          TableName: this.tables.player,
          Item: { ...playerKeys.ledger(playerId, hero.id, `debit#${material}`), location: camp.location, material, delta: -amount },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ]);
    await this.transact([
      {
        Put: {
          TableName: this.tables.player,
          Item: { ...playerKeys.hero(playerId, hero.id), ...heroItem(hero) },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.camp(playerId, camp.location),
          UpdateExpression:
            "SET #location = :location, hallLevel = if_not_exists(hallLevel, :one), warehouseLevel = if_not_exists(warehouseLevel, :one) ADD activeHeroes :one, livingHeroes :one",
          // No item is a camp at level 1 with no heroes.
          ConditionExpression: camp.stored ? conditions.join(" AND ") : "attribute_not_exists(PK)",
          ExpressionAttributeNames: { "#location": "location" },
          ExpressionAttributeValues: values,
        },
      },
      ...debits,
      {
        Put: {
          TableName: this.tables.location,
          Item: { ...locationKeys.seen(hero.location, hero.id), ...sightingOf(hero, new Date(hero.recruitedAt)) },
        },
      },
      // A ledger entry under the hero's id exists only if the hero does, so its failure is a repeat too.
    ], [HeroExists, RecruitRefused, ...cost.flatMap(() => [InsufficientBalance, HeroExists])]);
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
    const level = b.from + 1;
    const campKey = playerKeys.camp(playerId, camp.location);
    const onCamp = ON_CAMP[b.kind];
    const campChecks = b.requires.filter((r) => ON_CAMP[r.kind] && r.level > 1);
    const facilityChecks = b.requires.filter((r) => !ON_CAMP[r.kind]);
    const campCondition = (names: Record<string, string>, values: Record<string, unknown>): string[] =>
      campChecks.map((r, n) => {
        names[`#r${n}`] = ON_CAMP[r.kind]!; // filtered to the camp's own above
        values[`:r${n}`] = r.level;
        return `#r${n} >= :r${n}`;
      });

    const items: TransactItems = [];
    if (onCamp) {
      const names: Record<string, string> = { "#location": "location", "#level": onCamp };
      const values: Record<string, unknown> = { ":location": camp.location, ":level": level, ":one": 1, ":zero": 0 };
      const other = onCamp === "hallLevel" ? "warehouseLevel" : "hallLevel";
      // No item is a camp at level 1 with no heroes, which no requirement above level 1 is met by.
      const conditions = camp.stored ? [`#level = :from`, ...campCondition(names, values)] : ["attribute_not_exists(PK)"];
      if (camp.stored) values[":from"] = b.from;
      if (!camp.stored && campChecks.length > 0) throw new BuildRefused("a requirement is not met");
      items.push({
        Update: {
          TableName: this.tables.player,
          Key: campKey,
          UpdateExpression: `SET #location = :location, #level = :level, ${other} = if_not_exists(${other}, :one), activeHeroes = if_not_exists(activeHeroes, :zero), livingHeroes = if_not_exists(livingHeroes, :zero)`,
          ConditionExpression: conditions.join(" AND "),
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        },
      });
    } else {
      items.push({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.facility(playerId, camp.location, b.kind),
          UpdateExpression: "SET #location = :location, #kind = :kind, #level = :level",
          ConditionExpression: b.from === 0 ? "attribute_not_exists(PK)" : "#level = :from",
          ExpressionAttributeNames: { "#location": "location", "#kind": "kind", "#level": "level" },
          ExpressionAttributeValues: { ":location": camp.location, ":kind": b.kind, ":level": level, ...(b.from === 0 ? {} : { ":from": b.from }) },
        },
      });
      if (campChecks.length > 0) {
        const names: Record<string, string> = {};
        const values: Record<string, unknown> = {};
        const conditions = campCondition(names, values);
        items.push({
          ConditionCheck: { TableName: this.tables.player, Key: campKey, ConditionExpression: conditions.join(" AND "), ExpressionAttributeNames: names, ExpressionAttributeValues: values },
        });
      }
    }
    for (const r of facilityChecks) {
      items.push({
        ConditionCheck: {
          TableName: this.tables.player,
          Key: playerKeys.facility(playerId, camp.location, r.kind),
          ConditionExpression: "#level >= :need",
          ExpressionAttributeNames: { "#level": "level" },
          ExpressionAttributeValues: { ":need": r.level },
        },
      });
    }
    const checks = items.length;

    const cause = buildCause(camp.location, b.kind, level);
    for (const { material, amount } of b.cost) {
      items.push(
        {
          Update: {
            TableName: this.tables.player,
            Key: playerKeys.holding(playerId, camp.location, material),
            UpdateExpression: "SET balance = balance - :amount",
            ConditionExpression: "balance >= :amount",
            ExpressionAttributeValues: { ":amount": amount },
          },
        },
        {
          Put: {
            TableName: this.tables.player,
            Item: { ...playerKeys.ledger(playerId, cause, `debit#${material}`), location: camp.location, material, delta: -amount },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
      );
    }
    // A ledger entry under the build's cause exists only if the level was built, so its failure is a repeat too.
    await this.transact(items, [...Array.from({ length: checks }, () => BuildRefused), ...b.cost.flatMap(() => [InsufficientBalance, BuildRefused])]);
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
    const retired: Hero = { ...hero, status: "RETIRED", retiredAt: now.toISOString() };
    const alive = hero.status === "ALIVE";
    await this.transact([
      {
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.hero(playerId, hero.id),
          UpdateExpression: "SET #s = :retired, retiredAt = :at",
          ConditionExpression: `#s = :was AND #location = :location AND ${AT_CAMP}`,
          ExpressionAttributeNames: { "#s": "status", "#location": "location" },
          ExpressionAttributeValues: {
            ":retired": "RETIRED",
            ":at": retired.retiredAt,
            ":was": hero.status,
            ":location": hero.location,
            ":string": "S",
          },
        },
      },
      {
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.camp(playerId, hero.location),
          UpdateExpression: alive ? "ADD activeHeroes :less, livingHeroes :less" : "ADD activeHeroes :less",
          ConditionExpression: alive ? "activeHeroes > :zero AND livingHeroes > :zero" : "activeHeroes > :zero",
          ExpressionAttributeValues: { ":less": -1, ":zero": 0 },
        },
      },
      { Delete: { TableName: this.tables.location, Key: locationKeys.seen(hero.location, hero.id) } },
    ], [HeroChanged, HeroChanged]);
    return retired;
  }

  /**
   * One window of a location's sightings, in key order: from a point to the
   * end of the collection, or from its start to just before a point. Reads
   * at most `limit` items and says how many it read; the filter on expiry
   * runs after the limit, so an expired item counts towards it, which is
   * what keeps a sample's read bounded (decision 0029).
   */
  async sightings(
    location: string,
    window: { from: string } | { before: string },
    limit: number,
    now = new Date(),
  ): Promise<{ sightings: Sighting[]; read: number }> {
    const range = "from" in window
      ? { ":lo": `SEEN#${window.from}`, ":hi": "SEEN$" }
      : { ":lo": "SEEN#", ":hi": `SEEN#${window.before}` };
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.tables.location,
        KeyConditionExpression: "PK = :pk AND SK BETWEEN :lo AND :hi",
        FilterExpression: "expiresAt > :now",
        ExpressionAttributeValues: { ":pk": `LOCATION#${location}`, ...range, ":now": Math.floor(now.getTime() / 1000) },
        Limit: limit,
      }),
    );
    return { sightings: (r.Items ?? []).map(toSighting), read: r.ScannedCount ?? 0 };
  }

  private async query(playerId: string, prefix: string): Promise<Item[]> {
    const items: Item[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const r = await this.db.send(
        new QueryCommand({
          TableName: this.tables.player,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: { ":pk": `PLAYER#${playerId}`, ":sk": prefix },
          ...(start ? { ExclusiveStartKey: start } : {}),
        }),
      );
      items.push(...(r.Items ?? []));
      start = r.LastEvaluatedKey;
    } while (start);
    return items;
  }

  /**
   * Runs one transaction. `failures` maps the index of a cancelled item to
   * the error to throw when its condition failed; a conflict with another
   * transaction throws TransactionConflict for the caller to retry.
   *
   * No ClientRequestToken: DynamoDB's token makes an identical repeat a
   * silent success for ten minutes, which would hide exactly the repeats
   * the condition checks exist to report. The conditions are the idempotency
   * mechanism, keyed on the adventure id as the architecture states, and a
   * repeat is a typed error the caller maps (a repeated settle is
   * AdventureClosed, which submit answers with the settled record).
   */
  private async transact(
    items: TransactItems,
    failures: readonly (new (message: string) => Error)[],
  ): Promise<void> {
    try {
      await this.db.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (e) {
      if (!(e instanceof TransactionCanceledException)) throw e;
      const reasons = e.CancellationReasons ?? [];
      const conflict = reasons.find((r) => r.Code === "TransactionConflict");
      if (conflict) throw new TransactionConflict(conflict.Message ?? "conflict");
      const i = reasons.findIndex((r) => r.Code === "ConditionalCheckFailed");
      const Err = failures[i] ?? failures[failures.length - 1];
      if (i >= 0 && Err) throw new Err(`condition failed on item ${i}`);
      throw e;
    }
  }
}
