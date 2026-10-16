import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ensureTable } from "../packages/hub/src/db/table.js";
import { environment } from "./environment.js";

/**
 * Creates the hub's table in the DynamoDB Local container, with the same
 * definition the integration tests use, so a local run and a test run see
 * the same table. Terraform owns the real one. Run by `npm run local:table`
 * after `docker compose up -d`; the container keeps its data in memory, so
 * this runs again after every `docker compose down`.
 */
const client = new DynamoDBClient({
  region: "us-east-1",
  endpoint: environment.DYNAMODB_ENDPOINT,
  credentials: {
    accessKeyId: environment.AWS_ACCESS_KEY_ID,
    secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
  },
});
await ensureTable(client, environment.HEAT_TABLE);
console.log(`table ${environment.HEAT_TABLE} is ready at ${environment.DYNAMODB_ENDPOINT}`);
