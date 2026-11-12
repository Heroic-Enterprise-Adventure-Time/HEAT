import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

import { GSI1, KEY } from "../../src/db/keys.js";

/**
 * Creates a table with the key schema of src/db/keys.ts if it does not
 * exist. Test helper only: Terraform owns the real tables
 * (terraform/modules/environment/tables.tf), and the two definitions are
 * kept the same by hand, which is why both are this short. The tables named
 * in `indexed` get the location table's index, GSI1, projecting every
 * attribute as Terraform's does (decision 0050).
 */
export async function ensureTables(endpoint: string, tableNames: readonly string[], indexed: readonly string[] = []): Promise<void> {
  const client = new DynamoDBClient({ region: "us-east-1", endpoint });
  await Promise.all(tableNames.map((name) => ensureTable(client, name, indexed.includes(name))));
}

async function ensureTable(client: DynamoDBClient, tableName: string, indexed: boolean): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch (e) {
    if (!(e instanceof ResourceNotFoundException)) throw e;
  }
  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: KEY.pk, AttributeType: "S" },
        { AttributeName: KEY.sk, AttributeType: "S" },
        ...(indexed ? [{ AttributeName: GSI1.pk, AttributeType: "S" as const }, { AttributeName: GSI1.sk, AttributeType: "S" as const }] : []),
      ],
      KeySchema: [
        { AttributeName: KEY.pk, KeyType: "HASH" },
        { AttributeName: KEY.sk, KeyType: "RANGE" },
      ],
      ...(indexed
        ? {
            GlobalSecondaryIndexes: [
              {
                IndexName: GSI1.name,
                KeySchema: [
                  { AttributeName: GSI1.pk, KeyType: "HASH" },
                  { AttributeName: GSI1.sk, KeyType: "RANGE" },
                ],
                Projection: { ProjectionType: "ALL" },
              },
            ],
          }
        : {}),
    }),
  );
}
