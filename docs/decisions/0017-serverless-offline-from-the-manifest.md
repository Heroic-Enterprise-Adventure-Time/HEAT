# 0017: serverless-offline stays as the local gateway, configured from the manifest and pinned

- **Status:** Decided
- **Date:** 2026-10-16
- **Amends:** 0009, the API Gateway row of its table

## Decision

serverless-offline remains the emulator of API Gateway on the laptop: the HTTP API today, and the WebSocket API, including its connection management endpoint, when the live channel is built. It is configured by `local/serverless.ts`, which builds every function and route from `manifest.json` at the repository root, the same file the bundler and Terraform read, so no route is written twice (`docs/standards/typescript.md`, rule 4). The manifest moved from `local/` to the root with this decision, because it is no longer the emulator's file but everyone's.

The framework is pinned in three places that together pin one thing: `serverless` and `serverless-offline` as exact dev dependencies, and `frameworkVersion` set to the exact release in `serverless.ts`. The npm package is a launcher that downloads a versionless binary, which downloads the release the configuration names; without `frameworkVersion` the framework updates itself daily. Its install script is recorded as denied, since it only pre-downloads what the first run downloads anyway and CI never runs the emulator.

Serverless never deploys anything of HEAT's (decision 0011): the configuration carries no credentials, and `.claude/settings.json` denies an agent `serverless deploy` in its `sls` and `npx` forms. DynamoDB, S3 and SQS were never emulated by it and stay their own stand-ins, reached through the SDK as decision 0009 says.

**What the emulator checks.** The issue that agreed this checkpoint said serverless-offline verifies JWT signatures by default. Its source, read while implementing, says otherwise. With its `ignoreJWTSignature` option off, the plugin skips a JWT authorizer altogether and the route is open; with it on, the plugin checks that a token is present, unexpired, from the configured issuer and for the configured audience, and passes the claims to the handler. In neither mode does it verify the signature; the code carries a TODO to that effect. The option is therefore on, and the local README says plainly that a hand-made token with the right claims is accepted on the laptop. That is acceptable because the signature check that matters is the real gateway's, which the pipeline's smoke test proves after every merge (decision 0009), because the emulator listens on the laptop only, and because the handler never validates a token itself, so no code path is special-cased. If a local signature check is ever wanted, the plugin's documented `customAuthenticationProvider` hook takes a small strategy built on `aws-jwt-verify`, inside the framework.

**The framework's build is off.** Version 4 bundles TypeScript handlers with its own esbuild before running them, including under the plugin. That is a second bundler configuration beside `scripts/bundle.mjs`, which could drift from it, and in the first run it emitted an ES module bundle without the `require` shim the repository's bundler adds, so the hub's CommonJS dependencies failed on load. With `build.esbuild` set to false, serverless-offline loads the handler from its source through tsx, and the handler the emulator runs is the file the bundler reads.

**Why TypeScript for the configuration.** The framework documents `serverless.js` and `serverless.ts` alike. On Windows, release 4.44.0 loads a `.js` configuration by importing a bare drive path, which Node rejects (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), while it loads a `.ts` configuration through tsx, which works. The `.ts` form is also the one the typechecker covers, with the framework's published types.

**Licensing**, checked 2026-10-16 at serverless.com: version 4 is free for organizations under two million dollars of annual revenue and requires a sign-in or license key; the owner signed in once on the laptop. What would reopen this decision: the licensing changing, or the HTTP API emulation drifting from the real gateway once the first deployment (issue #14) lets the two be compared.

## Considered and not chosen

**A gateway of our own**: a small Node HTTP server reading the manifest, verifying Cognito tokens with `aws-jwt-verify` and calling the handlers with synthesized events. Proposed on 2026-10-16 when the emulator was re-evaluated under best-practices rule 9, and rejected as custom code in place of a tried framework. It would have had to grow a WebSocket emulation for the live channel, and the one thing it would have added over the plugin, a local signature check, is not the check that matters.

**Replacing the emulator because of the signature finding.** The finding removes one argument for the plugin, not the others: the HTTP API and WebSocket API emulation, the trigger emulation if a queue or stream ever returns, and the framework's own maintenance.

**Keeping `serverless.yml` with `${file()}` references into the manifest.** The routes would still have been written in the YAML, so the manifest and the configuration could drift; the YAML also mis-stated the handler, naming the entry file with its extension and no export, and its comment mis-stated the JWT behaviour. It had never served a request.

**Approving the launcher's install script.** It would have made every `npm ci` on CI fetch a binary from a third-party host for an emulator CI never runs.

**AWS SAM CLI.** Never supported WebSocket APIs locally; rejected in 0009 and still.

## Where it is described

`local/README.md`, `local/serverless.ts`, `manifest.json`; `docs/standards/typescript.md`, rules 2 to 4; `docs/process/code-changes.md`, "What enforces this"; `docs/decisions/README.md`.
