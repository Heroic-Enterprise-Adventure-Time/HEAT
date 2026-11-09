/**
 * The HTTP timeouts every AWS SDK client in the hub is built with, the one
 * place they are set (graphql.md, rule 17; Issue-211). An SDK call that
 * stalls fails here, and the SDK's retries of it fit inside the function's
 * 10 seconds, instead of one stalled call using them all up and the player
 * waiting that long for an error.
 *
 * Read in the installed `@smithy/node-http-handler` 4.14.2 and
 * `@smithy/core` on 2026-11-09:
 * - neither timeout has a value unless the client sets one, and an unset
 *   timeout sets no timer;
 * - `requestTimeout` only logs a warning unless `throwOnRequestTimeout` is
 *   true, so the flag is what makes it a timeout;
 * - its timer starts with the request, so it bounds the connection too;
 * - the client's `defaultsMode` is `legacy` unless configured, which adds no
 *   timeout, and options given here replace what any other mode would add;
 * - the SDK retries a `TimeoutError` as transient: 3 attempts, with up to
 *   100 ms and then 200 ms of backoff between them.
 *
 * So a call that never answers fails after about 3 × 2 s plus the backoff,
 * well inside 10 s. The hub's whole invocation took 446 ms at most in `dev`
 * and 426 ms in `prod` over the 14 days to 2026-11-09 (p99 272 ms and
 * 384 ms, cold starts included), so 2 s is several times the slowest call
 * seen. A call that times out may still have committed: a transaction's
 * conditions hold the rules for the retry, the hub's or the player's
 * (rules 7 and 18).
 */
export const requestHandler = {
  /** A connection that is not made in this time fails (the SDK's `in-region` mode uses 1.1 s). */
  connectionTimeout: 1_000,
  /** A request with no complete response in this time fails, connection included. */
  requestTimeout: 2_000,
  throwOnRequestTimeout: true,
} as const;
