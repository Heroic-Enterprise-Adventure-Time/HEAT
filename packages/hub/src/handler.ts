import { ApolloServer } from "@apollo/server";
import { handlers, startServerAndCreateLambdaHandler } from "@as-integrations/aws-lambda";
import { configFromEnv, createDocumentClient } from "./db/client.js";
import { createContextFactory, type Context } from "./context.js";
import { schema } from "./schema/schema.js";

/**
 * The hub as one Lambda behind the HTTP API. Apollo Server builds the
 * executable schema once per cold start; the Lambda integration adapts the
 * API Gateway HTTP API (payload 2.0) event to a request and back.
 */
const config = configFromEnv();
const db = createDocumentClient(config);

export const server = new ApolloServer<Context>({ schema });

export const handler = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  { context: createContextFactory(db, config.tableName) },
);
