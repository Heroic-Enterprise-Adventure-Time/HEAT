import type { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Tables } from "./db/client.js";
import { Repository } from "./db/repository.js";

/**
 * Per-request context. Identity comes from the API Gateway JWT authorizer,
 * which validated the Cognito token before the function ran; the function
 * trusts the claims it is handed and never sees the token. Tests synthesize
 * the event with claims. Rule 2 of decision 0009: the handler is a plain
 * function of an event and does not know who called it.
 */
export interface Context {
  playerId: string | undefined;
  repo: Repository;
}

export function identityFromEvent(event: APIGatewayProxyEventV2): string | undefined {
  // The integration types the event without an authorizer; the HTTP API
  // attaches one when a route has a JWT authorizer, which every route here has.
  const withJwt = event as Partial<APIGatewayProxyEventV2WithJWTAuthorizer>;
  const sub = withJwt.requestContext?.authorizer?.jwt?.claims?.["sub"];
  return typeof sub === "string" && sub.length > 0 ? sub : undefined;
}

export function createContextFactory(db: DynamoDBDocumentClient, tables: Tables) {
  const repo = new Repository(db, tables);
  return async ({ event }: { event: APIGatewayProxyEventV2 }): Promise<Context> => ({
    playerId: identityFromEvent(event),
    repo,
  });
}
