# Development

How a change is run and seen while it is being made. The system runs in the branch's sandbox stack; the laptop runs the fast loop. Nothing emulates AWS (decision 0018).

## Rules

1. **The stack is the system.** Every working branch has a stack, `heat-sb<issue>`, in `heat-sandbox`, created by the first push and re-applied by every push (`.github/workflows/sandbox.yml`). Running the system means pushing to the branch. The run's summary holds the plan and the stack's API URL; the branch's deployment on GitHub links to the URL.
2. **The fast loop is local and needs no AWS.** `npm test` at the root runs every package's tests; the hub's start their own DynamoDB Local container through Testcontainers, so Docker Desktop must be running. `npm run typecheck` and `npm run bundle` are the other two checks a push runs. The Angular dev server runs locally too (`docs/standards/typescript.md`, rule 15).
3. **A branch is pushed when it is created.** The worktree and the branch are created together and the branch is pushed at once (`docs/process/code-changes.md`, rule 22), so the stack exists from `main`'s code and every plan after that is a delta. A branch of any type gets a stack; a documentation branch's stack costs nothing at rest and goes with the branch.
4. **Call the stack with a token from the ci client.** The base pool's password-flow client `ci` and the test users `player1` and `player2` sign in with `InitiateAuth` (`USER_PASSWORD_AUTH`); the password is the `sandbox-base` environment's secret, which the owner holds. The stack's facts are in Parameter Store under `/heat/heat-sb<issue>/`: `api_url`, `user_pool_id`, `app_client_id`. Then `POST <api_url>/graphql` with `Authorization: Bearer <access token>`.
5. **Plan locally before pushing an infrastructure change.** From the worktree, with the bundle built, through the plan role (`docs/process/code-changes.md`, rule 23); `scripts/sandbox.mjs` derives the state key and the stack name from the branch:

   ```powershell
   . C:\Users\chanc\IdeaProjects\HEAT\docs\private\heat-tfvars.ps1 -Environment sandbox
   $env:AWS_PROFILE = "plan-heat-sandbox"
   npm run bundle
   node scripts/sandbox.mjs init
   node scripts/sandbox.mjs plan -- -lock=false
   ```

   `-lock=false` because the plan role may not write the lock file. A local bundle that differs from the runner's by a byte shows as a code change in the plan; the pipeline's hash is the one that counts.
6. **Read the stack's logs through the plan role.** The function logs to `/aws/lambda/heat-sb<issue>-hub` as JSON lines (Powertools), one line per GraphQL request with the operation name, duration and error count, and a warning per error; the API's access log, `/aws/apigateway/heat-sb<issue>-api`, shows what the JWT authorizer refused, which the function never sees. The plan role may read log lines from groups whose names carry `heat-sb`. Traces are in X-Ray, sampled at one request a second plus 5%.
7. **The cap.** At most 5 sandbox stacks may exist beside the base (`SANDBOX_STACK_CAP` in the workflow). A push that would create a sixth fails and names the five. Deleting a merged branch destroys its stack at once; a weekly sweep destroys any stack whose branch is gone, and a `workflow_dispatch` of the sweep with `dry_run` lists them without destroying. The deletion and the schedule run `main`'s copy of the workflow, so a change to those jobs takes effect once merged.
8. **What a sandbox stack lacks on purpose.** No point-in-time recovery, no deletion protection, seven-day log retention, no alarms: a stack lives as long as its branch. Those are `dev`'s and `prod`'s literals.

## Why

The emulator the project started with (decision 0009) could never exercise the piece of the request path most worth exercising, the JWT authorizer, and it was one more thing to keep faithful to API Gateway, forever a behavior behind. A stack costs nothing at rest and is the real gateway, the real authorizer, the real IAM path and the real logs (decision 0018). What stays local is what runs in seconds and needs nothing from AWS.

Pushing at creation puts the cap's refusal at the cheapest moment, before any work exists on the branch, and makes the first real plan a plan of the change rather than of the whole stack.

The GitHub environments `sandbox-<issue>` accumulate, one per issue; they hold nothing and are left alone.
