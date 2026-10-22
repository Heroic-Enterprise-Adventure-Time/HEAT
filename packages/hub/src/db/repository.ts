import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { STARTING_LOCATION, type AdventureSnapshot, type UnitType } from "@heat/engine";
import { sightingOf, type Sighting } from "../seen.js";
import type { Tables } from "./client.js";
import { locationKeys, playerKeys } from "./keys.js";

/**
 * The transactions the architecture names, as DynamoDB transactions: start
 * (the one-open-adventure rule, and the party marked as adventuring),
 * debit (the ledger's non-negative balance), settle (rewards once, keyed on
 * the adventure id), recruit (the hall's cap and the free-villager rule, on
 * the camp's counts) and retire (the hero's status and the camp's counts
 * together, never while the hero is adventuring). Each is one
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
export class AlreadySettled extends Error {}
export class TransactionConflict extends Error {}
export class HeroExists extends Error {}
export class RecruitRefused extends Error {}
export class HeroChanged extends Error {}

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
  stored: boolean;
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
 * the last four; the spike's settle is the only thing that still reads one.
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
  status: "OPEN" | "SETTLED";
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
  return { location, hallLevel: 1, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0, holdings: [], stored: false };
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
      const [, location, kind] = (i["SK"] as string).split("#");
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
   * the start fails one side or the other. Throws AdventureAlreadyOpen when
   * the first condition fails and HeroChanged when a hero's does.
   */
  async startAdventure(playerId: string, record: Omit<AdventureRecord, "playerId" | "status">): Promise<AdventureRecord> {
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
    ], [AdventureAlreadyOpen, AlreadyApplied, ...heroIds.map(() => HeroChanged)]);
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
   * Settle: close the open adventure only if it is this one, mark the record
   * settled, and credit each reward at the location with a ledger entry that
   * can exist once. A redelivery finds the open item gone and throws
   * AlreadySettled; nothing is paid twice. The party's heroes are back at
   * the camp: each mark start set is removed, on the condition that it is
   * this adventure's. This is the spike's settle, which credits whatever
   * location the caller names; the warehouse cap, XP and deaths arrive with
   * Issue-114's settlement.
   */
  async settle(
    playerId: string,
    adventureId: string,
    location: string,
    rewards: readonly { material: string; amount: number }[],
    heroIds: readonly string[] = [],
  ): Promise<void> {
    const items: TransactItems = [
      {
        Delete: {
          TableName: this.tables.player,
          Key: playerKeys.open(playerId),
          ConditionExpression: "adventureId = :id",
          ExpressionAttributeValues: { ":id": adventureId },
        },
      },
      {
        Update: {
          TableName: this.tables.location,
          Key: locationKeys.adventure(adventureId),
          UpdateExpression: "SET #s = :settled",
          ConditionExpression: "attribute_exists(PK) AND #s = :open",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":settled": "SETTLED", ":open": "OPEN" },
        },
      },
      ...heroIds.map((heroId) => ({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.hero(playerId, heroId),
          UpdateExpression: "REMOVE adventureId",
          ConditionExpression: "adventureId = :id",
          ExpressionAttributeValues: { ":id": adventureId },
        },
      })),
    ];
    for (const r of rewards) {
      items.push({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.holding(playerId, location, r.material),
          UpdateExpression: "SET material = :m ADD balance :amount",
          ExpressionAttributeValues: { ":m": r.material, ":amount": r.amount },
        },
      });
      items.push({
        Put: {
          TableName: this.tables.player,
          Item: {
            ...playerKeys.ledger(playerId, adventureId, `credit#${r.material}`),
            location,
            material: r.material,
            delta: r.amount,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      });
    }
    await this.transact(items, [AlreadySettled, AlreadySettled]);
  }

  /**
   * Recruit for free: put the hero only if its id is new, and count it into
   * the camp only if the camp has no living hero and a free slot, on the
   * camp as the caller read it, so a concurrent recruit, death or hall
   * upgrade between the read and the write fails the condition instead of
   * passing the cap. A camp with no item is created at level 1. No debit and
   * no ledger entry: the villager is free when no active hero is alive
   * (decision 0026). The hero is seen at its location as it is recruited
   * (decision 0029). Throws HeroExists when the id is taken, which is a
   * repeated request, and RecruitRefused when the camp's condition fails.
   */
  async recruitFree(playerId: string, camp: Camp, capacity: number, hero: Hero): Promise<Hero> {
    const values: Record<string, unknown> = { ":one": 1, ":location": camp.location };
    if (camp.stored) Object.assign(values, { ":level": camp.hallLevel, ":zero": 0, ":cap": capacity });
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
          ConditionExpression: camp.stored
            ? "hallLevel = :level AND livingHeroes = :zero AND activeHeroes < :cap"
            : "attribute_not_exists(PK)",
          ExpressionAttributeNames: { "#location": "location" },
          ExpressionAttributeValues: values,
        },
      },
      {
        Put: {
          TableName: this.tables.location,
          Item: { ...locationKeys.seen(hero.location, hero.id), ...sightingOf(hero, new Date(hero.recruitedAt)) },
        },
      },
    ], [HeroExists, RecruitRefused]);
    return hero;
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
   * repeat is a typed error the caller maps (a redelivered settle is
   * AlreadySettled, which the consumer treats as done).
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
