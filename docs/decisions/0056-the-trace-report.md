# 0056: The trace report: what each request did, read in review beside the cold start

- **Status:** Decided
- **Date:** 2026-11-18
- **Settles:** Issue-328: what the collected traces do for the development cycle. It follows decision 0055, which put the verb and the version on every trace, and corrects the sampling sentence 0055 left in `docs/process/development.md`, rule 7.

## Decision

**Every run that tests a stack reports what each request did, and a reviewer reads it beside the diff.** The job that read the cold start is now the stack report's (`.github/actions/stack-report`, in `sandbox.yml` and `deploy.yml`). After the cold start it runs `scripts/trace-report.mjs`, which writes one row for each shape of each request: the request named for its root fields, `Mutation.startAdventure`; its calls to DynamoDB and S3 counted by operation, `DynamoDB.GetItem 2, DynamoDB.TransactWriteItems 1`; how many requests took that shape; and their median duration, the hub's own span. The report goes to the run's summary and, on a working branch, to one comment on the pull request, edited in place.

**A row is a shape, not a verb.** A refusal and a success of the same field make different calls and take different times, and a query's calls follow the fields its document asks for. One row per verb would average them; one row per shape lets a changed count show as a new row beside the old one.

**The function's log is the list of requests.** The hub writes one line per request with its trace id (`packages/hub/src/observability.ts`), and the traces are fetched by those ids. The report therefore says how many of the logged requests were traced, on every run. A request the `previous` alias answered is left out, and so is one whose root fields carry another deploy's version, counted in the report's first line.

**Nothing is set to make requests sampled, because every request already is.** On `dev`, all 51 requests the hub logged in each of the last three deploys' runs were traced, 37 of them within five seconds in the last, and all 152 logged on 2026-11-12, before the OpenTelemetry layer. The Lambda guide says otherwise, one request a second and five percent of the rest, not configurable. The cause of the difference was not found. The report's first line is what would show it changing.

**Not a gate.** A duration on Lambda varies from run to run, and a required check on one would be red by noise. No ruleset names the job (`docs/process/code-changes.md`, rule 29). A real failure of the job, a read refused, fails the run and is fixed; a run with no trace says so and passes.

**`dev`'s figures are kept, not read again.** `dev`'s run uploads its report as the artifact `trace-report`, kept ninety days, the most the repository allows. A later run downloads the last one kept from a finished `Deploy` run on a push to `main` (`scripts/fetch-trace-baseline.sh`) and sets it beside its own: a branch's run beside `dev`, and `dev`'s run beside the merge before it. The table is then the union of both runs' rows, with a dash where one of them did not take a shape. A branch's role is in `heat-sandbox` and cannot read `dev`'s traces, and the kept report names the commit it measured. It is another run's artifact, so it is read as data: every value that would reach the page is checked to be what the script writes, and a report that is not is refused whole.

**The job holds a role and runs nothing downloaded:** the AWS CLI, `gh`, and scripts that import only Node's own modules (`docs/process/best-practices.md`, rule 13). In `deploy.yml` the role is `heat-dev-plan`, which is read only and already trusts the `dev` environment, under which a pull request's plan runs (decision 0020); the cold start is read as that role too. In `sandbox.yml` it stays the apply role, as the cold start's job had it. **No `bootstrap` change:** the issue expected one, and both roles could already read traces.

**A failed test names a trace from the log.** When the stack test or the browser test fails, the report names the trace of the last request the hub logged, and on any run the trace of each request that logged errors. An agent reads it through the plan role (decision 0055).

## Considered and not chosen

- **A sampling setting:** the layer's own sampler, or an X-Ray sampling rule. Nothing was unsampled, and the Lambda guide says the rate is not configurable for a function.
- **The sandbox plan role trusting `sandbox-*`,** so that the branch's job would read as a read-only role. It is a change to a guardrail, applied by the owner, and it removes nothing: a branch's workflow can assume the apply role under the same environment, and the plan role reads services outside the boundary that the apply role cannot.
- **Reading `dev`'s traces from a branch's run,** within X-Ray's retention. It needs a role in `heat-dev` that trusts a branch's run.
- **Finding a run's traces by `annotation[heat.version]`.** Two branches pushed at creation deploy the same commit, `main`'s, into the one sandbox account, so the version does not say which stack answered.
- **The trace id in the response,** as a header or in an error's `extensions`, so that the test could name it. The stack's response carries none. It would be a change to what the hub answers, for an id the log already holds beside the request.
- **Comparing `dev`'s live alias with its previous one.** The previous alias takes one or two requests a run. The kept report of the merge before is the same comparison over the whole test.
- **Asserting call counts in the hub's data-layer tests here.** That is where a count that should hold is asserted, with no stack; none is added by this work.
- **A baseline committed to the repository.** It would be a commit on `main` for every merge.

## Facts checked

All on 2026-11-18.

- **What the Lambda guide says of sampling** ("Visualize Lambda function invocations using AWS X-Ray"): "The sampling rate is 1 request per second and 5 percent of additional requests. You can't configure the X-Ray sampling rate for your functions." And that with active tracing an upstream service "decides whether incoming requests should be traced, then adds that sampling decision as a tracing header. Lambda uses that header to decide to send traces or not."
- **What was measured,** through `plan-heat-dev`: the hub's "graphql request" lines against `xray:BatchGetTraces` by their trace ids, for the `Deploy` runs of c09b381 (51 lines, 50 at the live alias and 1 at the previous, 51 traced), fd16e05 (51 of 51) and 3ec8dea (51 of 51), and for the whole of 2026-11-12 (152 of 152). `heat-dev`'s only sampling rule is `Default`, reservoir 1 and rate 0.05, read through `audit-heat-dev`.
- **What a trace holds** (a `startAdventure` trace from `heat-dev`): Lambda's two segments, the hub's own with `span.kind` `SERVER`, under it a subsegment for each root field with `graphql.field.name` and `heat.version`, and one in the `aws` namespace for each call, its annotation `span.name` being `DynamoDB.GetItem`; and an inferred segment for each table, which is not a call and is not counted.
- **The roles.** `heat-<environment>-apply` is `AdministratorAccess` under a boundary that allows `xray:*` and `logs:*` (`terraform/modules/bootstrap/boundary.tf`); the branch's own run exercised it. `heat-dev-plan` read the log and the traces above, as the agent; its trust of the `dev` environment is `terraform/modules/bootstrap/plan_role.tf`.
- **Artifacts.** The repository keeps an artifact ninety days at most (`gh api repos/{owner}/{repo}/actions/permissions/artifact-and-log-retention`). GitHub, "Storing and sharing data from a workflow": to download from another run "you need to supply a token and run identifier", and a download checks the artifact's digest.
- **The stack's response.** A signed-in `POST /graphql` to the issue's stack answered 200 with `apigw-requestid` among its headers and no trace header, and a body that held `data` alone; an unsigned one to `heat-dev` answered 401 the same way.

## Where it is described

`docs/process/development.md`, rules 1 and 7; `docs/architecture/overview.md`, the pipeline's diagram; `scripts/trace-report.mjs` and its test; `.github/actions/stack-report/action.yml`; `terraform/environment/sandbox/README.md` and `terraform/environment/dev/README.md`, what a run verifies; `terraform/bootstrap/README.md`, what the plan role is assumed for.
