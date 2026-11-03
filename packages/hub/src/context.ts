import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { GraphQLError } from "graphql";

import type { Tables } from "./db/client.js";
import { Repository } from "./db/repository.js";
import type { Timelines } from "./timelines.js";
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
  /** The previous deploy's version, HEAT_PREVIOUS_VERSION, if it is known. */
  previousVersion: string | undefined;
  /** The replay bucket's timelines (Issue-114). */
  timelines: Timelines;
  /** The version the client sent in the `heat-version` header, if it sent one. */
  clientVersion: string | undefined;
}

/**
 * The signed-in player's id. Every field that reads it declares the
 * `authenticated` scope, which the scope-auth plugin checks before the
 * resolver runs, so the throw is a guard against a field that forgot to.
 */
export function callerId(ctx: Context): string {
  if (ctx.playerId === undefined) throw new GraphQLError("not signed in", { extensions: { code: "UNAUTHENTICATED" } });
  return ctx.playerId;
}

export interface Identity {
  playerId: string;
  playerName: string;
}

/** The event as the HTTP API sends it when a route has a JWT authorizer, which every route here has; the integration types it without one, and a synthesized test event may have none. */
interface MaybeAuthorized {
  requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } };
}

export function identityFromEvent(event: APIGatewayProxyEventV2): Identity | undefined {
  const claims = (event as MaybeAuthorized).requestContext?.authorizer?.jwt?.claims ?? {};
  const sub = claims["sub"];
  if (typeof sub !== "string" || sub.length === 0) return undefined;
  const email = claims["email"];
  return { playerId: sub, playerName: typeof email === "string" && email.length > 0 ? email : sub };
}

export interface Versions {
  version: string;
  previousVersion: string | undefined;
}

export function createContextFactory(db: DynamoDBDocumentClient, tables: Tables, versions: Versions, timelines: Timelines) {
  const repo = new Repository(db, tables);
  const { version, previousVersion } = versions;
  // Apollo's context function returns a promise; nothing here waits.
  return ({ event }: { event: APIGatewayProxyEventV2 }): Promise<Context> => {
    const identity = identityFromEvent(event);
    // Payload 2.0 lower-cases header names.
    const clientVersion = event.headers[VERSION_HEADER];
    return Promise.resolve({ playerId: identity?.playerId, playerName: identity?.playerName, repo, version, previousVersion, timelines, clientVersion });
  };
}
