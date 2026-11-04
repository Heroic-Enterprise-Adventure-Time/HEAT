import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

import { ITEM_VERSION } from "../src/db/keys.js";
import { playerKeys } from "./keys.js";

/**
 * What the data-layer tests share for their data (typescript.md, rule 19): a
 * player no other test has, and an item as it is stored, read past the repository.
 */

export const player = () => `p-${randomUUID()}`;

/** An item a test puts past the repository, with what ElectroDB finds it by. */
export const whole = <Item extends object>(entity: string, item: Item) => ({ ...item, __edb_e__: entity, __edb_v__: ITEM_VERSION });

export async function storedItem(db: DynamoDBDocumentClient, table: string, key: { PK: string; SK: string }) {
  return (await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
}

/** Camps from before ElectroDB, each too big for three to fit a DynamoDB page, so that a read of them crosses a page. */
export async function putOldCampsPastAPage(db: DynamoDBDocumentClient, table: string, p: string, locations: readonly string[]) {
  const padding = "x".repeat(350_000);
  for (const location of locations) {
    await db.send(new PutCommand({ TableName: table, Item: { ...playerKeys.camp(p, location), location, hallLevel: 1, padding } }));
  }
}
