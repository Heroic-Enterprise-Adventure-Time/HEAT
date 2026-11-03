# 0040: Metrics through Powertools, with middy as the handler's middleware chain

- **Status:** Decided
- **Date:** 2026-11-03
- **Settles:** Issue-199: the conflict-rate alarm agreed in the PR-197 session and held for the library review of 2026-11-03, whose rows 10 and 12 are this decision.

## Decision

**The hub's metrics are Powertools', written as embedded metric format lines in its log.** `@aws-lambda-powertools/metrics` is pinned with the logger and the tracer at one version. `conflict.ts` emits `TransactionConflictRetry` when a verb runs again and `ConflictAnswered` when a verb answers `Conflict`, and the `logMetrics` middleware adds Powertools' `ColdStart`.

**A count is written twice, because an alarm must name a metric's dimensions exactly.** Stored and flushed at the end of the request under `[service]`, which is what the alarm reads, and at once under `[service, verb]`, which is what a person reads. The verb's count is a `singleMetric`, a line of its own, because a flush has one set of dimensions and one GraphQL request may run two mutations. The verb is one of six values, `build`, `discard`, `recruit`, `retire`, `settle`, `start`, named at each call site; the `service` dimension is `heat-hub` in every environment.

**The namespace is the stack's prefix,** `POWERTOOLS_METRICS_NAMESPACE = var.name_prefix`, because sandbox stacks share one AWS account and would otherwise share one metric.

**middy wraps the handler, hosting only the three Powertools middlewares:** `injectLambdaContext`, `captureLambdaHandler` and `logMetrics`, with the GraphQL handler from `@as-integrations/aws-lambda` innermost. It is the owner's call, made after weighing the overlap with Apollo: Apollo's plugins cover the GraphQL request and the integration's own `middleware` option covers the raw event and result, so middy's parsers, CORS, validators and HTTP error handlers are redundant here and are not used. It stays because it is the idiom Powertools documents and because of the weighting of 2026-11-03: the application is built as an enterprise system would be, and a common problem takes the library used there, for what it shows and teaches. In the owner's words, "I don't think there is any harm in keeping middy, even if it's just for that small bit."

**Two defaults are overridden.** `captureLambdaHandler` takes `captureResponse: false`, because by default it writes the handler's response into the trace and a GraphQL response can hold a player's whole camp (`docs/standards/graphql.md`, rule 16). Metrics takes a logger of its own at `ERROR`, because it warns on every flush that holds nothing, which is nearly every request; the documentation shows the same shape.

**Five alarms join the three per function,** only where the root names an address, so a sandbox stack still has none. All are one five-minute period, missing data not breaching, alarm and OK both notifying the topic.

| Alarm | Metric | Fires at |
| --- | --- | --- |
| `<prefix>-hub-conflicts-answered` | `ConflictAnswered`, `<prefix>` namespace, `service = heat-hub`, Sum | ≥ 1 |
| `<prefix>-player-transaction-conflicts`, `<prefix>-location-transaction-conflicts` | `TransactionConflict`, `AWS/DynamoDB`, `TableName`, SampleCount | ≥ 5 |
| `<prefix>-player-failed-conditions`, `<prefix>-location-failed-conditions` | `ConditionalCheckFailedRequests`, `AWS/DynamoDB`, `TableName`, SampleCount | ≥ 5 |

The table alarms read SampleCount, the calls rejected, because Sum counts each item of a transaction, so a threshold on it would move with a transaction's size. Fourteen days of `dev` and `prod` were read first, through the plan roles, with the owner's yes, because `AuditRole` is denied `cloudwatch:GetMetricStatistics`. Neither environment recorded a transaction conflict. `dev`'s player table recorded failed conditions in 15 five-minute periods, all on 2026-10-21 and 2026-10-22 and all during `Deploy` runs, at most Sum 5 and SampleCount 2; its location table at most 1 and 1; `prod`, none. A threshold of Sum ≥ 5, the shape first agreed, would have fired on those deploys, so the failed-conditions alarms read SampleCount like the others. The five is otherwise judgment: more than a double click, and more than the smoke test, on a table with no conflict traffic to measure.

## Considered and not chosen

- **A metric filter on the warning line.** It adds a log-derived metric to Terraform and ties an alarm to the wording of a log line. A metric the code names survives a change of wording.
- **`PutMetricData`.** A synchronous call to another service inside a request, with a permission on the function's role. An EMF line costs a line of log and needs neither.
- **No middy: Powertools' manual forms, in the handler or inside an Apollo plugin.** Each middleware has a documented manual form: `logger.addContext`; the tracer's `## handler` subsegment with `annotateColdStart`, `addServiceNameAnnotation` and response and error metadata; `publishStoredMetrics` in a `finally`, or `using` on Node 24. They work, and the library review of 2026-11-03 first recommended keeping the hand `addContext`. Not chosen for the reasons above; the tracer's alone is several lines the middleware keeps correct.
- **The integration's own `middleware` option, or an Apollo plugin, as the chain.** Both see the request, and neither is what Powertools' middlewares are written for, so the three would be rewritten by hand against them.
- **A metric math alarm over the verbs, with the verb as the only dimension set.** Six alarm metrics where one will do, against the free tier's ten, and a verb added without its line in the alarm would go unwatched.
- **The verb read from the message `retryingConflicts` was given, or from the GraphQL field through a plugin.** Either keeps the call sites as they were, which is what the issue first assumed; the first parses words meant for the player and the second is machinery for one string. Each verb names itself instead.
- **Dropping the failed-conditions alarms.** Proposed in the shape conversation, because AWS's page names only `PutItem`, `UpdateItem` and `DeleteItem` for the metric and every condition in the hub is inside `TransactWriteItems`, so the alarm looked as if it could never fire. `dev`'s history showed otherwise, and the alarms stayed.

## Facts checked

All read on 2026-11-03.

- **Powertools 2.36.0** (its metrics and tracer pages, and the published source of `Metrics.js`): `addDimension` joins the first set and `addDimensions` starts another; the source adds the default dimensions, `service` among them, to every set, which the page's example does not show; `publishStoredMetrics` warns through the given logger when nothing is stored; `captureColdStartMetric` writes a separate line under `function_name` and `service`; `POWERTOOLS_METRICS_DISABLED` takes precedence over `POWERTOOLS_DEV`, and both on and off send a function's lines through the global console as the testing section describes. `@aws-lambda-powertools/logger` 2.36.0 and `@aws-lambda-powertools/metrics` 2.36.0 accept `@middy/core` 4 to 7 as a peer.
- **middy 7.9.2** (its published source): the standard execution mode's handler is `async (event, context)`, two parameters.
- **DynamoDB's metrics** ("Metrics and dimensions", developer guide): `TransactionConflict`'s Sum counts each rejected item-level request and its SampleCount each rejected call, under `TableName`. The page describes `ConditionalCheckFailedRequests` by single-item writes only; `dev`'s history above is what shows it counting conditions inside transactions, and that it is per item is inferred from Sum exceeding SampleCount.
- **CloudWatch pricing:** ten metrics and ten standard-resolution alarm metrics in the free tier; $0.10 per alarm metric beyond it; custom metrics prorated hourly, "charges are incurred only when metrics are sent to CloudWatch in a given hour", each unique combination of dimensions a metric of its own. Eight alarms in an account stay inside the ten. A metric this rare costs almost nothing: `ColdStart` and whichever counts occur, in the hours they occur.

## Where it is described

`docs/standards/typescript.md`, rule 12; `docs/standards/graphql.md`, rules 16 and 18; `docs/architecture/overview.md`, the functions' paragraph; `terraform/modules/environment/README.md`.
