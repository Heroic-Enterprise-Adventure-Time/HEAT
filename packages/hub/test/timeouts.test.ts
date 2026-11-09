import { createServer, type Server, type Socket } from "node:net";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDocumentClient } from "../src/db/client.js";
import { requestHandler } from "../src/sdk.js";
import { createS3Client } from "../src/timelines.js";

/**
 * A stalled call fails within the hub's timeouts (Issue-211): a server that
 * accepts the connection and never answers stands in for a DynamoDB or S3
 * call that stalls. Each client gives up after its three attempts of
 * `requestTimeout` each, well inside the function's 10 seconds.
 */
let server: Server;
let endpoint: string;
const sockets = new Set<Socket>();

beforeAll(async () => {
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  endpoint = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

/** Runs a call against the stalled server and answers its error and how long it took. */
async function stalled(call: () => Promise<unknown>): Promise<{ error: unknown; ms: number }> {
  const started = performance.now();
  const error = await call().then(
    () => undefined,
    (e: unknown) => e,
  );
  return { error, ms: performance.now() - started };
}

/** Three attempts of the request timeout, the backoff between them, and slack for a busy runner. */
const BOUND_MS = 3 * requestHandler.requestTimeout + 1_000;

describe("a stalled SDK call", () => {
  it("fails within the timeout on DynamoDB and on S3", async () => {
    const db = createDocumentClient({ tables: { player: "p", location: "l" }, endpoint, region: "us-east-1" });
    const s3 = createS3Client({ region: "us-east-1", endpoint });
    const [dynamo, bucket] = await Promise.all([
      stalled(() => db.send(new GetCommand({ TableName: "p", Key: { pk: "x", sk: "y" } }))),
      stalled(() => s3.send(new GetObjectCommand({ Bucket: "b", Key: "k.json" }))),
    ]);
    for (const { error, ms } of [dynamo, bucket]) {
      expect(error).toMatchObject({ name: "TimeoutError", $metadata: { attempts: 3 } });
      expect(ms).toBeGreaterThanOrEqual(3 * requestHandler.requestTimeout);
      expect(ms).toBeLessThan(BOUND_MS);
    }
  });
});
