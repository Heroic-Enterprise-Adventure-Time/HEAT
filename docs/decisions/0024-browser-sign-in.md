# 0024: Browser sign-in: managed login on a custom domain, the code grant with PKCE through oidc-client-ts, one public client per stack with rotating refresh tokens

- **Status:** Decided
- **Date:** 2026-10-18
- **Settles:** the overview's working assumption that "the browser signs in with the authorization code flow and PKCE, and the API validates the tokens", and the shape of the browser app client that 0018 and 0022 left to Issue-46.

## Decision

**Where a player signs in.** Through the pool's managed login on a custom domain, `auth.<zone name>`, the same shape in every environment: `auth.heat-sb.dcg-games.com`, `auth.heat-dev.dcg-games.com`, `auth.heat.dcg-games.com` (`terraform/modules/login-domain`, 0022 as amended). Google is the pool's one provider (0018 as amended), so the client sends the browser to the authorize endpoint with `identity_provider=Google` and the managed login page, whose one control would be a Google button, is not shown.

**The grant.** The authorization code grant with PKCE, the one the Cognito guide recommends for public clients, performed by `oidc-client-ts`, an OpenID Connect relying-party library with no framework dependency, wrapped in one Angular service (`packages/client/src/app/session.ts`). The library generates the verifier and the state, exchanges the code at the pool's token endpoint, which answers browsers cross-origin, keeps the tokens in session storage, and renews them with the refresh token before they expire. The endpoints are given to it from `config.json`, so no discovery request is made; the authority is the pool's issuer, which is what the tokens name and what the API's JWT authorizer verifies against. Sign-out forgets the tokens and leaves through Cognito's logout endpoint with `client_id` and `logout_uri`, which the library's generic sign-out does not match.

**The client per stack.** One public app client per stack in the shared pool (`terraform/modules/environment/sign_in.tf`), `<prefix>-browser`: the code grant only, the scopes `openid email profile`, Google as its only provider, callback and sign-out URLs the stack's hostname and `http://localhost:4200`, so that the Angular dev server signs in to a real stack. A managed login branding style with Cognito's provided values, because a client created through the API has none and the login page needs one. The JWT authorizer accepts two audiences: this client and the base's `ci` client, whose tokens the stack test carries.

**Token lifetimes.** Access and ID tokens of one hour, Cognito's default and the `ci` client's; a refresh token of 30 days, Cognito's default, with refresh token rotation on and a grace period of ten seconds. Rotation is incompatible with the `REFRESH_TOKEN_AUTH` flow, so the client's explicit flows name `USER_SRP_AUTH` alone, the one flow the API requires to be named that reveals nothing a browser cannot already do; nothing uses it.

**What the client knows.** `config.json`, written beside the build by the apply job from the stack's outputs: `graphqlPath`, `userPoolId`, `clientId`, `loginHost`. It is read before the application starts; a page that cannot read it says so instead of failing. On the dev server, `proxy.conf.mjs` fetches it, and `/graphql`, from the branch's stack, found from the issue number in the branch name.

**Which token the API gets** is Issue-15's call: the authorizer accepts the ID token's `aud` and the access token's `client_id` alike, and the hub reads the email claim when it is there, which only the ID token carries.

## Considered and not chosen

**Cognito's prefix domain**, `<prefix>.auth.us-east-1.amazoncognito.com`. The first shape of Issue-46's first pull request. Same price, no record or certificate of HEAT's, and the guide says it has little visible effect when every sign-in is a third-party redirect. The owner chose the custom domain for every environment on 2026-10-17: a sign-in host under the game's own domain, and no dependence on a region-wide prefix being free, which `heat` is not. The cost is a placeholder A record at the sandbox zone's apex, for Cognito's check that the parent resolves, and a module composed after the environment module in `dev` and `prod`, where the parent record is the site's.

**The flow written by hand** with the Web Crypto API: PKCE, state, the code exchange and the refresh are a few hundred lines, and a showcase could show them. Rejected because the guide's own instruction is to handle the token endpoint with an OpenID Connect library, and sign-in is the one place where a small mistake is a security hole rather than a bug.

**An Angular-specific library**, `angular-oauth2-oidc`. Mature, but it peer-depends on the Angular major and moves with it; `oidc-client-ts` depends on nothing but `jwt-decode` and is unaffected by `ng update`.

**AWS Amplify's Auth category.** It does the redirect flow against Cognito and much else; the rest is weight the client does not need, and its configuration model competes with `config.json`.

**Showing the managed login page.** With Google as the only provider the page is one button. The authorize endpoint with `identity_provider` is the guide's own test URL and the same flow; the branding style still exists, for the day a second provider or a password form is wanted.

**Discovery from the issuer** instead of the endpoints in `config.json`. One request fewer per page load, and a deterministic set of endpoints; the issuer's discovery document names the same ones.

**Local storage for the tokens.** Survives the tab, and so survives into any script that ever runs on the origin. Session storage is the library's default and enough for a game; Issue-58's Content-Security-Policy is the other half of that defence.

**No refresh token rotation.** The guide calls rotation "a security best practice"; what it costs is the `REFRESH_TOKEN_AUTH` flow, which the browser does not use, and a ten-second window for a second tab.

**Longer tokens.** One hour and 30 days are Cognito's defaults and a game needs no more; a player who returns after a month signs in with Google again, which is a click.

## Facts checked

All read on 2026-10-17 and 2026-10-18.

- **The token endpoint** (Cognito developer guide, "The token endpoint"): "The token endpoint returns an `Access-Control-Allow-Origin: *` response header. You can call the token endpoint cross-origin from a browser-based application. For example, you can complete an authorization code grant with Proof Key for Code Exchange (PKCE) from a public client"; "Handle token requests with an OpenID Connect (OIDC) library in your application"; the refresh grant "Returns a new refresh token with new ID and access token when refresh token rotation is active".
- **App clients** (the guide, "Application-specific settings with app clients"): "As a best security practice in public-client apps, activate only the authorization-code grant OAuth flow, and implement Proof Key for Code Exchange (PKCE)"; callback URLs must be HTTPS "except for `http://localhost` for testing purposes only"; a public client "does not have a client secret".
- **Refresh tokens** (the guide, "Refresh tokens"): default expiry 30 days, settable "between 60 minutes and 10 years"; rotation "reissues a refresh token within the same fixed validity window"; "you must disable this authentication flow [`REFRESH_TOKEN_AUTH`] in your app client"; the grace period is "up to 60 seconds"; "As a security best practice, enable refresh token rotation on your app clients". The API reference, `CreateUserPoolClient`: without `ExplicitAuthFlows` a client "supports `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_SRP_AUTH`, and `ALLOW_CUSTOM_AUTH`", which is why the flows are named.
- **The branding style** (API reference, `CreateManagedLoginBranding`): "To create a new style with default settings, set `UseCognitoProvidedValues` to `true` and don't provide values for any other options"; a client may have one style, replaced by deleting it.
- **The custom domain** (the guide, "Using your own domain for managed login"): in 0022's amendment and the sandbox base's README.
- **`oidc-client-ts`** (npm, 3.5.0, published 2026-03-13): one dependency, `jwt-decode`; no install script. Its `UserManager` takes `metadata` in place of discovery, performs PKCE for `response_type: "code"`, stores the user in `sessionStorage` by default, and with `automaticSilentRenew` uses the refresh token when one is present, taking a rotated refresh token from the response.
- **The provider** (hashicorp/aws 6.69.1): `aws_cognito_user_pool_client` has `refresh_token_rotation` with `feature` and `retry_grace_period_seconds`, and `read_attributes`; `aws_cognito_managed_login_branding` has `use_cognito_provided_values`.

## Where it is described

`docs/architecture/overview.md`, "Services and data" and "Environments". `terraform/modules/environment/sign_in.tf` and its README; `terraform/modules/login-domain`; `terraform/environment/sandbox/README.md`. `packages/client/src/app/session.ts`, `config.ts`, `proxy.conf.mjs`. `docs/process/development.md`, `docs/standards/typescript.md` rule 15.
