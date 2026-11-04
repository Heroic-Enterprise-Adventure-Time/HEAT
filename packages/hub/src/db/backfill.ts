import { ConditionalCheckFailedException, TransactionConflictException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, paginateScan, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import type { Tables } from "./client.js";
import { ITEM_VERSION } from "./keys.js";

/**
 * Makes the items the hand-written repository wrote whole for ElectroDB:
 * their identifiers and the composite attributes of their keys, which the keys
 * give (decisions 0041 and 0042). The pipeline runs it under the apply role, after
 * every apply, until Issue-213 removes it; the one code outside the repository
 * that calls DynamoDB (graphql.md, rule 17), because no entity can read an item
 * none owns. It reads only keys, and tells only counts.
 */

export interface Backfilled {
  /** Items made whole by this run. */
  written: number;
  /** Items it could not make whole, which a later run tries again: a conflict with a transaction, or an item of a kind it does not know. */
  remaining: number;
  /** Items left as they are: the spike's holdings, which nothing reads, and sightings, which expire within a week. */
  leftAside: number;
}

interface Whole {
  entity: string;
  attributes: Record<string, string>;
}

/** The entity an item belongs to and its composites, from its keys; undefined for an item left aside or not known. */
function wholeOf(pk: string, sk: string): Whole | undefined {
  const [partition = "", id = ""] = pk.split("#");
  if (partition === "ADVENTURE" && sk === "RECORD") return { entity: "adventure", attributes: { adventureId: id } };
  if (partition !== "PLAYER") return undefined;
  const [kind = "", first = "", second = "", third = ""] = sk.split("#");
  const of = (entity: string, composites: Record<string, string> = {}): Whole => ({ entity, attributes: { playerId: id, ...composites } });
  if (kind === "PROFILE") return { entity: "profile", attributes: { id } };
  if (kind === "OPEN") return of("open");
  if (kind === "HERO") return of("hero", { id: first });
  if (kind === "LEDGER") return of("ledger", { cause: first, entry: sk.slice(`LEDGER#${first}#`.length) });
  if (kind === "AT" && second === "CAMP") return of("camp", { location: first });
  if (kind === "AT" && second === "FACILITY") return of("facility", { location: first, kind: third });
  if (kind === "AT" && second === "HOLDING") return of("holding", { location: first, material: third });
  return undefined;
}

function isLeftAside(pk: string, sk: string): boolean {
  return (pk.startsWith("PLAYER#") && sk.startsWith("HOLDING#")) || (pk.startsWith("LOCATION#") && sk.startsWith("SEEN#"));
}

/**
 * One item. `attribute_exists(PK)` is what keeps a settle or a discard that
 * deleted the item since the scan from having it written back as a husk, which
 * an open item would make of a player who can never start again.
 * `attribute_not_exists` on the identifier makes it safe to repeat and safe
 * beside live writes.
 */
export async function makeWhole(db: DynamoDBDocumentClient, table: string, key: { PK: string; SK: string }): Promise<"written" | "not needed" | "not made"> {
  const whole = wholeOf(key.PK, key.SK);
  if (!whole) return "not made";
  const attributes = Object.entries({ __edb_e__: whole.entity, __edb_v__: ITEM_VERSION, ...whole.attributes });
  try {
    await db.send(new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: `SET ${attributes.map((_, n) => `#a${n} = :a${n}`).join(", ")}`,
      ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(#e)",
      ExpressionAttributeNames: { "#e": "__edb_e__", ...Object.fromEntries(attributes.map(([name], n) => [`#a${n}`, name])) },
      ExpressionAttributeValues: Object.fromEntries(attributes.map(([, value], n) => [`:a${n}`, value])),
    }));
    return "written";
  } catch (e) {
    if (e instanceof ConditionalCheckFailedException) return "not needed";
    if (e instanceof TransactionConflictException) return "not made";
    throw e;
  }
}

async function* keysWithoutIdentifiers(db: DynamoDBDocumentClient, table: string): AsyncGenerator<{ PK: string; SK: string }> {
  const pages = paginateScan({ client: db }, {
    TableName: table,
    ProjectionExpression: "PK, SK",
    FilterExpression: "attribute_not_exists(#e)",
    ExpressionAttributeNames: { "#e": "__edb_e__" },
  });
  for await (const page of pages) yield* (page.Items ?? []) as { PK: string; SK: string }[];
}

export async function backfill(db: DynamoDBDocumentClient, tables: Tables): Promise<Backfilled> {
  const count: Backfilled = { written: 0, remaining: 0, leftAside: 0 };
  for (const table of [tables.player, tables.location]) {
    for await (const key of keysWithoutIdentifiers(db, table)) {
      if (isLeftAside(key.PK, key.SK)) {
        count.leftAside++;
        continue;
      }
      const made = await makeWhole(db, table, key);
      if (made === "written") count.written++;
      if (made === "not made") count.remaining++;
    }
  }
  return count;
}
