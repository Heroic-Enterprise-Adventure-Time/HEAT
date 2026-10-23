import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

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

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const player = env["HEAT_PLAYER_TABLE"];
  const location = env["HEAT_LOCATION_TABLE"];
  if (!player) throw new Error("HEAT_PLAYER_TABLE is not set");
  if (!location) throw new Error("HEAT_LOCATION_TABLE is not set");
  return {
    tables: { player, location },
    endpoint: env["DYNAMODB_ENDPOINT"],
    region: env["AWS_REGION"] ?? "us-east-1",
  };
}

/**
 * `instrument` wraps the low-level client before the document client is
 * built on it: the handler passes the tracer's capture, so every DynamoDB
 * call is a subsegment of the request's trace. Tests pass nothing.
 */
export function createDocumentClient(
  config: DbConfig,
  instrument: (client: DynamoDBClient) => DynamoDBClient = (client) => client,
): DynamoDBDocumentClient {
  const base = new DynamoDBClient({
    ...(config.region ? { region: config.region } : {}),
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
  return DynamoDBDocumentClient.from(instrument(base), {
    marshallOptions: { removeUndefinedValues: true },
  });
}
