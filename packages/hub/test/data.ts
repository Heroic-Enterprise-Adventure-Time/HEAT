import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

/**
 * What the data-layer tests share for their data (typescript.md, rule 19): a
 * player no other test has, and an item as it is stored, read past the repository.
 */

export const player = () => `p-${randomUUID()}`;

export async function storedItem(db: DynamoDBDocumentClient, table: string, key: { PK: string; SK: string }) {
  return (await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
}
