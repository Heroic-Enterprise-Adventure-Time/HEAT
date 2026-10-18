import { ApolloServer } from "@apollo/server";
import { handlers, startServerAndCreateLambdaHandler } from "@as-integrations/aws-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context as LambdaContext } from "aws-lambda";
import { configFromEnv, createDocumentClient } from "./db/client.js";
import { createContextFactory, type Context } from "./context.js";
import { logger, requestLogging, tracer } from "./observability.js";
import { schema } from "./schema/schema.js";

/**
 * The hub as one Lambda behind the HTTP API. Apollo Server builds the
 * executable schema once per cold start; the Lambda integration adapts the
 * API Gateway HTTP API (payload 2.0) event to a request and back. The
 * DynamoDB client is captured by the tracer, so each call is a subsegment
 * of the request's trace.
 */
const config = configFromEnv();
const db = createDocumentClient(config, (client) => tracer.captureAWSv3Client(client));

export const server = new ApolloServer<Context>({ schema, plugins: [requestLogging()] });

const graphql = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  { context: createContextFactory(db, config.tables) },
);

/**
 * Adds the invocation's request id and function details to every log line
 * of the request, then hands the event to Apollo.
 */
export const handler = async (event: APIGatewayProxyEventV2, context: LambdaContext): Promise<APIGatewayProxyResultV2> => {
  logger.addContext(context);
  return graphql(event, context, () => undefined) as Promise<APIGatewayProxyResultV2>;
};
