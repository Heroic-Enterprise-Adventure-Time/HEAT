import { TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { Tables } from "./client.js";
import { locationKeys, playerKeys } from "./keys.js";

/**
 * The three transactions the architecture names, as DynamoDB transactions:
 * start (the one-open-adventure rule), debit (the ledger's non-negative
 * balance), settle (rewards once, keyed on the adventure id). Each is one
 * TransactWriteItems call with condition checks; a failed condition cancels
 * the whole write and the cancellation reasons say which item failed.
 *
 * Start and settle write to both tables in one transaction: the player's
 * open item and ledger in the player table, the adventure record in the
 * location table. TransactWriteItems spans tables in one account and
 * region, so the split of decision 0023 costs the transactions nothing.
 */

export class AdventureAlreadyOpen extends Error {}
export class InsufficientBalance extends Error {}
export class AlreadyApplied extends Error {}
export class AlreadySettled extends Error {}
export class TransactionConflict extends Error {}

export interface Player {
  id: string;
  name: string;
}

export interface Holding {
  material: string;
  balance: number;
}

export interface OpenAdventure {
  adventureId: string;
  seed: string;
  startedAt: string;
}

export interface AdventureRecord {
  adventureId: string;
  playerId: string;
  seed: string;
  status: "OPEN" | "SETTLED";
}

type TransactItems = NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]>;

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

  async getPlayer(id: string): Promise<Player | undefined> {
    const r = await this.db.send(new GetCommand({ TableName: this.tables.player, Key: playerKeys.profile(id) }));
    return r.Item ? { id: r.Item["id"], name: r.Item["name"] } : undefined;
  }

  async setBalance(playerId: string, material: string, balance: number): Promise<void> {
    await this.db.send(
      new PutCommand({
        TableName: this.tables.player,
        Item: { ...playerKeys.holding(playerId, material), material, balance },
      }),
    );
  }

  async holdings(playerId: string): Promise<Holding[]> {
    const r = await this.db.send(
      new QueryCommand({
        TableName: this.tables.player,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `PLAYER#${playerId}`, ":sk": "HOLDING#" },
      }),
    );
    return (r.Items ?? []).map((i) => ({ material: i["material"], balance: i["balance"] }));
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
    return r.Item
      ? {
          adventureId: r.Item["adventureId"],
          playerId: r.Item["playerId"],
          seed: r.Item["seed"],
          status: r.Item["status"],
        }
      : undefined;
  }

  /**
   * Start: write the open-adventure item only if the player has none, and
   * the adventure record only if the id is new. Throws AdventureAlreadyOpen
   * when the first condition fails.
   */
  async startAdventure(playerId: string, adventureId: string, seed: string, now = new Date()): Promise<OpenAdventure> {
    const open: OpenAdventure = { adventureId, seed, startedAt: now.toISOString() };
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
          Item: { ...locationKeys.adventure(adventureId), adventureId, playerId, seed, status: "OPEN" },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ], [AdventureAlreadyOpen, AlreadyApplied]);
    return open;
  }

  /**
   * Debit: reduce a holding only if the balance covers it, and record the
   * ledger entry only once per adventure and material. Throws
   * InsufficientBalance or AlreadyApplied.
   */
  async debit(playerId: string, adventureId: string, material: string, amount: number): Promise<void> {
    if (amount <= 0) throw new RangeError("amount must be positive");
    await this.transact([
      {
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.holding(playerId, material),
          UpdateExpression: "SET balance = balance - :amount",
          ConditionExpression: "balance >= :amount",
          ExpressionAttributeValues: { ":amount": amount },
        },
      },
      {
        Put: {
          TableName: this.tables.player,
          Item: { ...playerKeys.ledger(playerId, adventureId, `debit#${material}`), material, delta: -amount },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ], [InsufficientBalance, AlreadyApplied]);
  }

  /**
   * Settle: close the open adventure only if it is this one, mark the record
   * settled, and credit each reward with a ledger entry that can exist once.
   * A redelivery finds the open item gone and throws AlreadySettled; nothing
   * is paid twice.
   */
  async settle(playerId: string, adventureId: string, rewards: readonly { material: string; amount: number }[]): Promise<void> {
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
    ];
    for (const r of rewards) {
      items.push({
        Update: {
          TableName: this.tables.player,
          Key: playerKeys.holding(playerId, r.material),
          UpdateExpression: "SET material = :m ADD balance :amount",
          ExpressionAttributeValues: { ":m": r.material, ":amount": r.amount },
        },
      });
      items.push({
        Put: {
          TableName: this.tables.player,
          Item: { ...playerKeys.ledger(playerId, adventureId, `credit#${r.material}`), material: r.material, delta: r.amount },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      });
    }
    await this.transact(items, [AlreadySettled, AlreadySettled]);
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
