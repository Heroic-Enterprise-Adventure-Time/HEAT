import type { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { Tables } from "./db/client.js";
import { Repository } from "./db/repository.js";
import { VERSION_HEADER } from "./version.js";

/**
 * Per-request context. Identity comes from the API Gateway JWT authorizer,
 * which validated the Cognito token before the function ran; the function
 * trusts the claims it is handed and never sees the token. Tests synthesize
 * the event with claims. Rule 2 of decision 0009: the handler is a plain
 * function of an event and does not know who called it.
 */
export interface Context {
  playerId: string | undefined;
  /** The name a profile is created with when the player has none: the token's email, else the subject. */
  playerName: string | undefined;
  repo: Repository;
  /** The deploy's version, HEAT_VERSION (decision 0030). */
  version: string;
  /** The version the client sent in the `heat-version` header, if it sent one. */
  clientVersion: string | undefined;
}

export interface Identity {
  playerId: string;
  playerName: string;
}

export function identityFromEvent(event: APIGatewayProxyEventV2): Identity | undefined {
  // The integration types the event without an authorizer; the HTTP API
  // attaches one when a route has a JWT authorizer, which every route here has.
  const withJwt = event as Partial<APIGatewayProxyEventV2WithJWTAuthorizer>;
  const claims = withJwt.requestContext?.authorizer?.jwt?.claims ?? {};
  const sub = claims["sub"];
  if (typeof sub !== "string" || sub.length === 0) return undefined;
  const email = claims["email"];
  return { playerId: sub, playerName: typeof email === "string" && email.length > 0 ? email : sub };
}

export function createContextFactory(db: DynamoDBDocumentClient, tables: Tables, version: string) {
  const repo = new Repository(db, tables);
  return async ({ event }: { event: APIGatewayProxyEventV2 }): Promise<Context> => {
    const identity = identityFromEvent(event);
    // Payload 2.0 lower-cases header names.
    const clientVersion = event.headers?.[VERSION_HEADER];
    return { playerId: identity?.playerId, playerName: identity?.playerName, repo, version, clientVersion };
  };
}
