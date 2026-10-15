import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Rule 1 of decision 0009: every AWS call goes through an SDK client whose
 * endpoint and credential source are configuration. In AWS the endpoint is
 * unset and the credentials are the function's role. Locally and in tests,
 * DYNAMODB_ENDPOINT points at the DynamoDB Local container and the
 * credentials are the throwaway values the container ignores. The code does
 * not know which.
 */
export interface DbConfig {
  tableName: string;
  endpoint?: string | undefined;
  region?: string | undefined;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const tableName = env.HEAT_TABLE;
  if (!tableName) throw new Error("HEAT_TABLE is not set");
  return {
    tableName,
    endpoint: env.DYNAMODB_ENDPOINT,
    region: env.AWS_REGION ?? "us-east-1",
  };
}

export function createDocumentClient(config: DbConfig): DynamoDBDocumentClient {
  const base = new DynamoDBClient({
    ...(config.region ? { region: config.region } : {}),
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  });
  return DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
