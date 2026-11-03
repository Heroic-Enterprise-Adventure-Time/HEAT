import {
  CreateTableCommand,
  DescribeTableCommand,
  type DynamoDBClient,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";

import { KEY } from "../../src/db/keys.js";

/**
 * Creates a table with the key schema of src/db/keys.ts if it does not
 * exist. Test helper only: Terraform owns the real tables
 * (terraform/modules/environment/tables.tf), and the two definitions are
 * kept the same by hand, which is why both are this short.
 */
export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<void> {
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
      ],
      KeySchema: [
        { AttributeName: KEY.pk, KeyType: "HASH" },
        { AttributeName: KEY.sk, KeyType: "RANGE" },
      ],
    }),
  );
}
