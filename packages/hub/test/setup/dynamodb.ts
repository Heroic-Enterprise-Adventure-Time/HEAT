import { GenericContainer, type StartedTestContainer } from "testcontainers";

import { PREVIOUS_VERSION, VERSION } from "../versions.js";
import { ensureTables } from "./table.js";

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
  process.env["DYNAMODB_ENDPOINT"] = endpoint;
  process.env["HEAT_PLAYER_TABLE"] = "heat-test-player";
  process.env["HEAT_LOCATION_TABLE"] = "heat-test-location";
  process.env["AWS_REGION"] = "us-east-1";
  process.env["AWS_ACCESS_KEY_ID"] = "test";
  process.env["AWS_SECRET_ACCESS_KEY"] = "test";
  process.env["POWERTOOLS_LOG_LEVEL"] = "SILENT";
  process.env["POWERTOOLS_METRICS_DISABLED"] = "true";
  process.env["HEAT_VERSION"] = VERSION;
  process.env["HEAT_PREVIOUS_VERSION"] = PREVIOUS_VERSION;
  // Named only: the handler's tests never reach S3. Submit is proven
  // against the in-memory store, and the bucket by the stack test.
  process.env["HEAT_REPLAY_BUCKET"] = "heat-test-replays";

  await ensureTables(endpoint, ["heat-test-player", "heat-test-location"], ["heat-test-location"]);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
