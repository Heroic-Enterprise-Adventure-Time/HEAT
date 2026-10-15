import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

/**
 * The single table, in spike form. Terraform owns the real one; this
 * definition exists so tests and the local emulator create an identical table.
 *
 * Key design (one table, generic keys):
 *   PLAYER#<id>    | PROFILE                        player, public fields
 *   PLAYER#<id>    | HOLDING#<material>             balance, private
 *   PLAYER#<id>    | OPEN                           the one open adventure
 *   PLAYER#<id>    | LEDGER#<adventureId>#<entry>   append-only, private
 *   ADVENTURE#<id> | RECORD                         status, seed, result
 */
export const KEY = { pk: "PK", sk: "SK" } as const;

export const keys = {
  player: (id: string) => ({ PK: `PLAYER#${id}`, SK: "PROFILE" }),
  holding: (id: string, material: string) => ({ PK: `PLAYER#${id}`, SK: `HOLDING#${material}` }),
  open: (id: string) => ({ PK: `PLAYER#${id}`, SK: "OPEN" }),
  ledger: (id: string, adventureId: string, entry: string) => ({
    PK: `PLAYER#${id}`,
    SK: `LEDGER#${adventureId}#${entry}`,
  }),
  adventure: (adventureId: string) => ({ PK: `ADVENTURE#${adventureId}`, SK: "RECORD" }),
};

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
