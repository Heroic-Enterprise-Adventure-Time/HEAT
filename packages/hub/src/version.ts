import type { ApolloServerPlugin } from "@apollo/server";

import type { Context } from "./context.js";

/**
 * One version for the whole app (decision 0030): the commit the workflow
 * deployed, which Terraform sets on the function as HEAT_VERSION and the
 * publish step writes into config.json. The hub stamps it on every
 * adventure it starts, and the client sends the one it loaded in the
 * `heat-version` header of every request, so the hub can say when the
 * client is not the deploy's.
 */
export const VERSION_HEADER = "heat-version";

export function versionFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const version = env["HEAT_VERSION"];
  if (!version) throw new Error("HEAT_VERSION is not set");
  return version;
}

/**
 * The version the previous alias runs (decision 0030), HEAT_PREVIOUS_VERSION,
 * which Terraform reads from the function at live when it plans the deploy;
 * undefined where it is empty, a previous deploy from before Issue-113.
 * Only a discard reads it.
 */
export function previousVersionFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const previous = env["HEAT_PREVIOUS_VERSION"];
  return previous === undefined || previous === "" ? undefined : previous;
}

/**
 * `extensions.outdated: true` on every response to a request whose header
 * names another version, errors included. A request with no header is not
 * flagged: the client sends it from Issue-115 on, and what it does with the
 * flag is Issue-115's and Issue-15's.
 */
export function outdatedFlag(): ApolloServerPlugin<Context> {
  // Apollo's hooks return promises; nothing here waits.
  return {
    requestDidStart() {
      return Promise.resolve({
        willSendResponse({ contextValue, response }) {
          const { clientVersion, version } = contextValue;
          if (clientVersion !== undefined && clientVersion !== version && response.body.kind === "single") {
            const result = response.body.singleResult;
            result.extensions = { ...result.extensions, outdated: true };
          }
          return Promise.resolve();
        },
      });
    },
  };
}
