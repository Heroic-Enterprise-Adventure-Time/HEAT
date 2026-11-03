import { ApolloServer } from "@apollo/server";
import { handlers, startServerAndCreateLambdaHandler } from "@as-integrations/aws-lambda";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import { captureLambdaHandler } from "@aws-lambda-powertools/tracer/middleware";
import { S3Client } from "@aws-sdk/client-s3";
import middy from "@middy/core";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context as LambdaContext } from "aws-lambda";

import { type Context, createContextFactory } from "./context.js";
import { configFromEnv, createDocumentClient } from "./db/client.js";
import { logger, metrics, requestLogging, tracer } from "./observability.js";
import { schema } from "./schema/schema.js";
import { S3Timelines } from "./timelines.js";
import { outdatedFlag, previousVersionFromEnv, versionFromEnv } from "./version.js";

/**
 * The hub as one Lambda behind the HTTP API, at both of its aliases: live
 * behind /graphql and previous behind /previous/graphql (decision 0030),
 * the path never read here. Apollo Server builds the executable schema
 * once per cold start; the Lambda integration adapts the API Gateway HTTP
 * API (payload 2.0) event to a request and back. The DynamoDB and S3
 * clients are captured by the tracer, so each call is a subsegment of the
 * request's trace. The deploy's version is read once, like the tables and
 * the replay bucket, and every response says when the client's differs.
 */
const config = configFromEnv();
const version = versionFromEnv();
const previousVersion = previousVersionFromEnv();
const db = createDocumentClient(config, (client) => tracer.captureAWSv3Client(client));
const replayBucket = process.env["HEAT_REPLAY_BUCKET"];
if (!replayBucket) throw new Error("HEAT_REPLAY_BUCKET is not set");
const timelines = new S3Timelines(tracer.captureAWSv3Client(new S3Client({ region: config.region ?? "us-east-1" })), replayBucket);

export const server = new ApolloServer<Context>({ schema, plugins: [requestLogging(), outdatedFlag()] });

const graphql = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  { context: createContextFactory(db, config.tables, { version, previousVersion }, timelines) },
);

/**
 * Apollo innermost, with Powertools' three middlewares around it (decision
 * 0040): the invocation's request id and function details on every log line,
 * the handler's subsegment in the trace, and the metrics flushed with the
 * cold start counted. The response stays out of the trace, because a GraphQL
 * response can hold a player's whole camp (graphql.md, rule 16).
 */
export const handler = middy((event: APIGatewayProxyEventV2, context: LambdaContext) => graphql(event, context, () => undefined) as Promise<APIGatewayProxyResultV2>)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use(logMetrics(metrics, { captureColdStartMetric: true }));
