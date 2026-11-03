import type { ApolloServerPlugin } from "@apollo/server";
import { Logger } from "@aws-lambda-powertools/logger";
import { Tracer } from "@aws-lambda-powertools/tracer";

import type { Context } from "./context.js";

/**
 * Structured logging and tracing, through Powertools for AWS Lambda. Both
 * are configured by the environment Terraform sets on the function:
 * POWERTOOLS_SERVICE_NAME names the service in every log line and trace,
 * POWERTOOLS_LOG_LEVEL sets the level. Outside Lambda, in the tests, the
 * tracer disables itself and the test setup silences the logger, so nothing
 * here branches on where it runs.
 */
export const logger = new Logger();
export const tracer = new Tracer();

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
