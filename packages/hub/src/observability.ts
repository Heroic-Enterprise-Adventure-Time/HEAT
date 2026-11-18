import type { ApolloServerPlugin } from "@apollo/server";
import { Logger } from "@aws-lambda-powertools/logger";
import { Metrics } from "@aws-lambda-powertools/metrics";
import { trace } from "@opentelemetry/api";
import { AttributeNames, createOpenTelemetryWrapper } from "@pothos/tracing-opentelemetry";

import type { Context } from "./context.js";

/**
 * Structured logging and metrics through Powertools for AWS Lambda, and
 * tracing through OpenTelemetry (decision 0055). The first two are
 * configured by the environment Terraform sets on the function:
 * POWERTOOLS_SERVICE_NAME names the service in every log line and metric,
 * POWERTOOLS_LOG_LEVEL sets the level, POWERTOOLS_METRICS_NAMESPACE names
 * the stack's namespace. The test setup silences the logger and the
 * metrics, so nothing here branches on where it runs.
 */
export const logger = new Logger();

/**
 * Metrics warns on every flush that holds none, which is nearly every
 * request here, so its own messages go to a logger of their own at ERROR;
 * the logger above is what the hub says for itself.
 */
export const metrics = new Metrics({ logger: new Logger({ logLevel: "ERROR" }) });

/** The deploy's version on a root field's span (decision 0030), so that a trace says which deploy answered. */
export const VERSION_ATTRIBUTE = "heat.version";

/**
 * A span for each root field a request runs, named for it, `Query.me` or
 * `Mutation.startAdventure`, through Pothos's own OpenTelemetry wrapper, so
 * that a trace says what the request did and how long each field took, where
 * the function's own span says only `POST /graphql`. The field's name, which
 * the wrapper records as `graphql.field.name`, and the deploy's version are
 * named as X-Ray annotations, which is what makes them searchable there
 * ("Migrate to OpenTelemetry Node.js", X-Ray developer guide, read
 * 2026-11-17).
 *
 * The name is the schema's, a closed set, never the operation name a client
 * sends. Nothing else of the request is recorded: the wrapper's arguments
 * and source stay off, because they are the request's variables and its
 * document (docs/standards/graphql.md, rule 16). Nor is an error: a refusal
 * is thrown as a class and answered as data (rule 6), and an exception on
 * the span would mark an expected answer as a failure. What failed is the
 * log's to say.
 *
 * The tracer is whatever provider is registered when a span starts. In
 * Lambda that is the AWS Lambda Layer for OpenTelemetry's, which also makes
 * the function's span and one for each DynamoDB and S3 call; where none is
 * registered, as in every test but the tracing one, each span is a no-op.
 */
export const traceRootField = createOpenTelemetryWrapper<boolean>(trace.getTracer("heat-hub"), {
  includeArgs: false,
  includeSource: false,
  ignoreError: true,
  onSpan(span, _options, _parent, _args, context, info) {
    span.updateName(`${info.parentType.name}.${info.fieldName}`);
    // The wrapper types the context as any object; it is the one the handler built.
    span.setAttribute(VERSION_ATTRIBUTE, (context as Context).version);
    span.setAttribute("aws.xray.annotations", [AttributeNames.FIELD_NAME, VERSION_ATTRIBUTE]);
  },
});

/**
 * One log line per GraphQL request, with the operation, the duration and
 * whether it carried errors, and one warning per error, so a failing
 * request can be found in the log group without reading bodies. Nothing
 * logs variables or responses: those can hold private data.
 */
export function requestLogging(): ApolloServerPlugin<Context> {
  // Apollo's hooks return promises; nothing here waits.
  return {
    requestDidStart() {
      const started = performance.now();
      return Promise.resolve({
        didEncounterErrors({ errors }) {
          for (const error of errors) {
            logger.warn("graphql error", { message: error.message, path: error.path ?? null });
          }
          return Promise.resolve();
        },
        willSendResponse({ request, errors }) {
          logger.info("graphql request", {
            operationName: request.operationName ?? null,
            durationMs: Math.round(performance.now() - started),
            errors: errors?.length ?? 0,
          });
          return Promise.resolve();
        },
      });
    },
  };
}
