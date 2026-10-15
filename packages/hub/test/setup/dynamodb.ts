import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ensureTable } from "../../src/db/table.js";

/**
 * Vitest global setup: one DynamoDB Local container for the whole run,
 * AWS's own image, started by Testcontainers. The same image the compose
 * file uses for a local run, so tests and development see the same store.
 * Requires Docker, on a laptop and on the CI runner alike (decision 0009).
 */
let container: StartedTestContainer | undefined;

export async function setup(): Promise<void> {
  container = await new GenericContainer("amazon/dynamodb-local:latest")
    .withCommand(["-jar", "DynamoDBLocal.jar", "-inMemory", "-sharedDb"])
    .withExposedPorts(8000)
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(8000)}`;
  process.env.DYNAMODB_ENDPOINT = endpoint;
  process.env.HEAT_TABLE = "heat-test";
  process.env.AWS_REGION = "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = "test";
  process.env.AWS_SECRET_ACCESS_KEY = "test";

  await ensureTable(new DynamoDBClient({ region: "us-east-1", endpoint }), "heat-test");
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
