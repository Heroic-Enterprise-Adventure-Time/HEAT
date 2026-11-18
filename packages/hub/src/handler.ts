import { ApolloServer } from "@apollo/server";
import { handlers, startServerAndCreateLambdaHandler } from "@as-integrations/aws-lambda";
import { injectLambdaContext } from "@aws-lambda-powertools/logger/middleware";
import { logMetrics } from "@aws-lambda-powertools/metrics/middleware";
import middy from "@middy/core";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context as LambdaContext } from "aws-lambda";

import { type Context, createContextFactory } from "./context.js";
import { configFromEnv, createDocumentClient } from "./db/client.js";
import { logger, metrics, requestLogging } from "./observability.js";
import { schema } from "./schema/schema.js";
import { createS3Client, replayBucketFromEnv, S3Timelines } from "./timelines.js";
import { outdatedFlag, previousVersionFromEnv, versionFromEnv } from "./version.js";

/**
 * The hub as one Lambda behind the HTTP API, at both of its aliases: live
 * behind /graphql and previous behind /previous/graphql (decision 0030),
 * the path never read here. Apollo Server builds the executable schema
 * once per cold start; the Lambda integration adapts the API Gateway HTTP
 * API (payload 2.0) event to a request and back. Nothing here traces: the
 * function's span and one for each DynamoDB and S3 call are the AWS Lambda
 * Layer for OpenTelemetry's, which sees the SDK because it is loaded from
 * node_modules beside this file and not bundled into it (decision 0055;
 * `scripts/bundle.mjs`), and a root field's span is the schema's
 * (`src/observability.ts`). The deploy's version is read once, like the
 * tables and the replay bucket, and every response says when the client's
 * differs.
 */
const config = configFromEnv();
const version = versionFromEnv();
const previousVersion = previousVersionFromEnv();
const db = createDocumentClient(config);
const timelines = new S3Timelines(createS3Client({ region: config.region ?? "us-east-1" }), replayBucketFromEnv());

export const server = new ApolloServer<Context>({ schema, plugins: [requestLogging(), outdatedFlag()] });

const graphql = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  { context: createContextFactory(db, config.tables, { version, previousVersion }, timelines) },
);

/**
 * Apollo innermost, with Powertools' two middlewares around it (decisions
 * 0040 and 0055): the invocation's request id and function details on every
 * log line, and the metrics flushed with the cold start counted. middy's early
 * timeout is off: it would answer while a verb is still pending, and Lambda
 * freezes that verb and resumes it in the next invocation, where a timeout left
 * to Lambda resets the environment.
 */
export const handler = middy((event: APIGatewayProxyEventV2, context: LambdaContext) => graphql(event, context, () => undefined) as Promise<APIGatewayProxyResultV2>, { timeoutEarlyInMillis: 0 })
  .use(injectLambdaContext(logger))
  .use(logMetrics(metrics, { captureColdStartMetric: true }));
