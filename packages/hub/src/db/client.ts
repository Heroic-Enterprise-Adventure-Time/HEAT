import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import * as z from "zod/mini";

import { parseEnv, requiredVariable } from "../env.js";
import { maxAttempts, requestHandler } from "../sdk.js";

/**
 * Rule 1 of decision 0009: every AWS call goes through an SDK client whose
 * endpoint and credential source are configuration. In AWS the endpoint is
 * unset and the credentials are the function's role. In tests,
 * DYNAMODB_ENDPOINT points at the DynamoDB Local container and the
 * credentials are the throwaway values the container ignores. The code does
 * not know which.
 */
export interface Tables {
  player: string;
  location: string;
}

export interface DbConfig {
  tables: Tables;
  endpoint?: string | undefined;
  region?: string | undefined;
}

const DbEnv = z.object({
  HEAT_PLAYER_TABLE: requiredVariable,
  HEAT_LOCATION_TABLE: requiredVariable,
  DYNAMODB_ENDPOINT: z.optional(z.string()),
  AWS_REGION: z._default(z.string(), "us-east-1"),
});

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const { HEAT_PLAYER_TABLE: player, HEAT_LOCATION_TABLE: location, DYNAMODB_ENDPOINT: endpoint, AWS_REGION: region } = parseEnv(DbEnv, env);
  return { tables: { player, location }, endpoint, region };
}

/**
 * The document client, with the hub's timeouts (`sdk.ts`). Nothing wraps it
 * for tracing: in Lambda the layer instruments the SDK as it is loaded
 * (decision 0055).
 */
export function createDocumentClient(config: DbConfig): DynamoDBDocumentClient {
  const base = new DynamoDBClient({
    requestHandler,
    maxAttempts,
    ...(config.region ? { region: config.region } : {}),
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
