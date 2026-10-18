import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ensureTable } from "./table.js";

/**
 * Vitest global setup: one DynamoDB Local container for the whole run,
 * AWS's own image, started by Testcontainers, with the two tables of
 * decision 0023 created in it. Requires Docker, on a laptop and on the CI
 * runner alike (decision 0009). The Powertools logger is silenced, because
 * a test run is not a log group.
 */
let container: StartedTestContainer | undefined;

export async function setup(): Promise<void> {
  container = await new GenericContainer("amazon/dynamodb-local:latest")
    .withCommand(["-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"])
    .withExposedPorts(8000)
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
  process.env.DYNAMODB_ENDPOINT = endpoint;
  process.env.HEAT_PLAYER_TABLE = "heat-test-player";
  process.env.HEAT_LOCATION_TABLE = "heat-test-location";
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";
  process.env.POWERTOOLS_LOG_LEVEL = "SILENT";

  const client = new DynamoDBClient({ region: "us-east-1", endpoint });
  await ensureTable(client, "heat-test-player");
  await ensureTable(client, "heat-test-location");
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
