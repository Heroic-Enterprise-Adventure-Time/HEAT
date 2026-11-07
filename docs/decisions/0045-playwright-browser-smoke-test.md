# 0045: A Playwright smoke test of the page on every stack, its trace encrypted to a committed certificate

- **Status:** Decided. Amended by 0046 on 2026-11-06: the browser's job holds no role, and `.github/actions/stack-test` calls `.github/actions/browser-test`. "The workflow holds no secret" below no longer holds for the workflow as a whole: the repository secret `HEAT_E2E_HANDOVER_KEY` seals the test user's password. The trace's encryption still needs no secret.
- **Date:** 2026-11-04
- **Settles:** Issue-202, from the library review of 2026-11-03 (row 22): the pipeline tested a stack through its API and the page by hand, so nothing showed that a real browser could get from the hostname to a drawn camp.

## Decision

**What runs.** `@playwright/test`, in `packages/client/e2e/`, with `packages/client/playwright.config.ts` and its own `tsconfig.e2e.json`, after the stack test and the cold start in `sandbox.yml` and, for `dev`, in `deploy.yml`. It opens the stack's hostname signed out with `config.json` saying Google is the only way in, as on `dev` and `prod`, and follows the sign-in control to the authorize endpoint, whose redirect to Google it reads and does not follow. Signed in, it sees the camp's scene canvas, recruits the free villager if the camp has none, opens the hero's card and signs out. A broken page or a failed request for art fails the test. `prod` keeps the anonymous check of `scripts/e2e.mjs` (decision 0024: its pool has no test users and no password-flow client).

**One engine.** Headless Chromium, because the test asks whether the page works, not how browsers differ. The browser is installed on every run by `npx playwright install --with-deps chromium`, as Playwright's CI page recommends.

**How it gets a session.** On a sandbox stack, through the managed login's email and password form (decision 0024, Issue-86), as the stack's `e2e-<issue>` user. `dev` has no form and never gains one for this test, so its session is the `ci` client's token, signed in with the password flow as `scripts/e2e.mjs` does, which the stack's authorizer accepts, and written into session storage where `oidc-client-ts` looks for its user, with no refresh token. That path and the Google hand-off run on every sandbox stack too, so a change that breaks them shows on the branch and not first on `dev`. `dev`'s page therefore never exercises the form or the code exchange against its own client. A sandbox stack's run exercises that code and the same build.

**Reaching the recruit.** The stack test leaves a living villager, so on a sandbox stack the browser test retires every living hero through the card before it looks at the hall, which makes the recruit run every time. `dev`'s test user keeps its villager, as in `scripts/e2e.mjs`.

**No role's credentials in the browser.** `scripts/browser-test.mjs` reads the stack's parameters under the job's role, then starts Playwright with every `AWS_` variable removed, and the browser's install step blanks them too (`docs/process/best-practices.md`, rule 13). The steps live once, in `.github/actions/browser-test`, because `deploy.yml`'s copy runs only on `main` and a drifted copy would show first on `dev`.

**A failed run's trace is encrypted before it leaves the runner.** A trace is kept on failure only, because it is what makes a browser failure readable. It holds the test user's password, its access token and its refresh token (see "Facts checked"), and the repository is public, so a plain artifact would publish them. `scripts/seal-browser-trace.sh` packs the results and encrypts them with `openssl cms` to `scripts/browser-trace-recipient.pem`, a committed certificate, and the workflow uploads only the result, as the artifact `browser-trace`, for 7 days. The workflow holds no secret, which keeps decision 0020's "the stacks take no secret". The private key is `docs/private/heat-browser-trace-key.pem`, git-ignored on the owner's laptop, where an agent's session can read a failed trace too. It is held nowhere else: if it is lost, a new pair replaces the certificate and only old artifacts become unreadable. The certificate carries no other trust.

## Considered and not chosen

**Cypress**, the other established choice. A test that crosses origins, from the stack to the login host and back, has to wrap that part in `cy.origin`, in a callback that sees only what is passed to it as `args`, while the same steps in Playwright are ordinary lines of the test. Crossing origins is this test's whole first half.

**The test in `scripts/`**, beside `e2e.mjs`. Those are plain `.mjs`, outside the typed lint and rule 6's flags. The test is about the page and depends on the client's labels, so it lives with the client.

**A second browser engine.** Firefox or WebKit would multiply the install and the run for a question they do not change.

**A password form on `dev`.** Decision 0024 rejected it, and a test is not a reason to reopen that: the form would be the one difference between `dev`'s and `prod`'s login pages.

**Only the signed-out half on `dev`.** Cheaper, and it leaves `dev` proving the page loads, while its authorizer, its tables and its CloudFront behaviors are what differ from a sandbox stack's. The seeded path costs one function.

**Failure screenshots instead of a trace.** Safe in public and readable without a key, but it loses the network log and the DOM, which is most of what a trace is for.

**Scrubbing known values out of the trace.** The password appears in more than one encoding in more than one file, and one encoding missed publishes a credential.

**Pausing tracing around the password, or changing the password after the run.** Neither reaches the tokens: every later request carries one in the network log, and the authorizer checks a token offline, so a changed password or a global sign-out leaves it working until it expires.

**Encrypting with a symmetric key in a secret.** Needs a secret in every sandbox environment, which holds none by decision, and a stack job that can read that secret could read a trace.

## Facts checked

- `@playwright/test` 1.64.1 on npm, read 2026-11-04: one dependency, `playwright`; no install script.
- Playwright, "Continuous Integration", read 2026-11-04: "Caching browser binaries is not recommended", because restoring takes about as long as downloading and Linux's OS dependencies cannot be cached. Its GitHub Actions workflow runs `npx playwright install --with-deps`.
- Playwright, "Authentication", read 2026-11-04: session storage is not persisted by a storage state, and its recipe writes it through `context.addInitScript`. Playwright, "Trace viewer": `retain-on-failure` records every test and removes the trace of a passing one. Neither page says anything about secrets in a trace.
- What a trace holds, observed 2026-11-04 by searching a real one from `heat-sb202` by count, without printing a value: the password plain in `trace.trace` and form-encoded in a request body under `resources/`; the access token in `trace.network` and in a response under `resources/`; the `Bearer` header in `trace.network`; a `refresh_token` field in the token response.
- The artifact: GitHub's "Downloading workflow artifacts" requires read access to the repository, which a public repository gives everyone.
- Cypress, `cy.origin`, read 2026-11-04: it "runs Cypress commands on a page at a different origin", and a variable declared outside the callback is not visible inside it, so every value goes through `args`.
- What a route sees, observed 2026-11-04 on `heat-sb202`'s authorize endpoint with `identity_provider=Google`: a route on `accounts.google.com` did not catch the request that Cognito's 302 led to, and the browser loaded Google's own page. A route on the authorize request does catch it, and `route.fetch({ maxRedirects: 0 })` reads the redirect without following it.
- `oidc-client-ts` 3.5.0, read from its package: the user's key is `oidc.user:<authority>:<client id>`, and `toStorageString` writes `id_token`, `session_state`, `access_token`, `refresh_token`, `token_type`, `scope`, `profile` and `expires_at`.
- On the runner, 2026-11-04, run 41896960143 on `heat-sb202`: `ubuntu-latest` has no GPU, and the scene drew anyway, with the seeded session's test green through the canvas, the recruit and the card. WebGL there is software rendering, as it was in the same headless Chromium on a laptop (`ANGLE`, `SwiftShader`).
- The sealed artifact, from that run's real failure, a selector of the test's own: read as an archive it is refused; decrypted with the private key it holds `trace.zip` and `error-context.md`. The run's public log held no bearer token and no JWT.
- The composite action's path, by a deliberate failure, run 41908178826 on `heat-sb202`: only the forced test failed, `browser-trace` was uploaded and decrypted to its `trace.zip`, and the run's public log held no bearer token and no JWT. The failure was reverted in the next commit.
- Encryption: `openssl cms -encrypt` and `-decrypt` on a real 2.7 MB trace, 2026-11-04, returned it byte for byte, about 700 bytes larger.

## Where it is described

`docs/process/development.md`, rule 1; `docs/process/best-practices.md`, rule 13; `docs/standards/angular.md`, rule 18; `docs/standards/typescript.md`, rules 8, 14, 16 and 17; `packages/client/e2e/`; `scripts/browser-test.mjs`; `scripts/seal-browser-trace.sh`; `.github/actions/browser-test`.
