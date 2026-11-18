import { randomUUID } from "node:crypto";

import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";

/**
 * The event the handler's tests call it with: a synthesized HTTP API
 * (payload 2.0) event, the shape API Gateway sends after its JWT authorizer
 * has validated the token and attached the claims (decision 0009, rule 2).
 * One helper for every test file that drives the handler
 * (docs/standards/typescript.md, rule 19).
 */
export type Handler = (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: LambdaContext) => Promise<{
  statusCode?: number;
  body?: string;
}>;

/** A `POST /graphql` with the query and its variables, from `playerId` when one is given and from nobody when not. */
export function event(
  query: string,
  variables: Record<string, unknown> = {},
  playerId?: string,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: "2.0",
    routeKey: "POST /graphql",
    rawPath: "/graphql",
    rawQueryString: "",
    headers: { "content-type": "application/json", ...headers },
    requestContext: {
      accountId: "000000000000",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "local",
      http: { method: "POST", path: "/graphql", protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "vitest" },
      requestId: randomUUID(),
      routeKey: "POST /graphql",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
      authorizer: playerId
        ? { principalId: playerId, integrationLatency: 0, jwt: { claims: { sub: playerId }, scopes: [] } }
        : (undefined as unknown as APIGatewayProxyEventV2WithJWTAuthorizer["requestContext"]["authorizer"]),
    },
    body: JSON.stringify({ query, variables }),
    isBase64Encoded: false,
  };
}
