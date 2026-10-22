import { ApolloServer } from "@apollo/server";
import { S3Client } from "@aws-sdk/client-s3";
import { handlers, startServerAndCreateLambdaHandler } from "@as-integrations/aws-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context as LambdaContext } from "aws-lambda";
import { configFromEnv, createDocumentClient } from "./db/client.js";
import { createContextFactory, type Context } from "./context.js";
import { logger, requestLogging, tracer } from "./observability.js";
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
const replayBucket = process.env.HEAT_REPLAY_BUCKET;
if (!replayBucket) throw new Error("HEAT_REPLAY_BUCKET is not set");
const timelines = new S3Timelines(tracer.captureAWSv3Client(new S3Client({ region: config.region ?? "us-east-1" })), replayBucket);

export const server = new ApolloServer<Context>({ schema, plugins: [requestLogging(), outdatedFlag()] });

const graphql = startServerAndCreateLambdaHandler(
  server,
  handlers.createAPIGatewayProxyEventV2RequestHandler(),
  { context: createContextFactory(db, config.tables, { version, previousVersion }, timelines) },
);

/**
 * Adds the invocation's request id and function details to every log line
 * of the request, then hands the event to Apollo.
 */
export const handler = async (event: APIGatewayProxyEventV2, context: LambdaContext): Promise<APIGatewayProxyResultV2> => {
  logger.addContext(context);
  return graphql(event, context, () => undefined) as Promise<APIGatewayProxyResultV2>;
};
