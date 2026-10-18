# The sandbox base

What every per-issue sandbox stack in `heat-sandbox` shares, in one permanent root: the hosted zone `heat-sb.dcg-games.com`, the certificate for that name and its wildcard, and the account's one Cognito user pool with its managed login domain, Google as its identity provider and its `ci` app client, composed from the module `terraform/modules/base`, which the `dev` and `prod` roots compose too. The first stack the pipeline applies, and the root that proves the plan-on-pull-request, apply-on-merge path (decisions 0017, 0018, 0020). The pool's shape is decision 0022. History: Issue-37; the certificate, Issue-39; the domain and Google, Issue-46.

**Status: applied by the pipeline on 2026-10-17, by the `Deploy` run on the merge of Issue-37's pull request (PR-48), under the `sandbox-base` GitHub environment: 3 added, nothing changed or destroyed, the allow-list check passed, and the test-user step created both users. Verified by the agent the same evening.** Read through `audit-heat-sandbox`: the zone with its four name servers and only its NS and SOA records; the pool `heat-sb-base-users` with the Essentials tier, deletion protection active, email as the case-insensitive username and required, administrator-only creation, MFA off, administrator-only recovery, no domain, and the default password policy read back as eight characters minimum with upper case, lower case, a number and a symbol required and a seven-day temporary password; the one client `ci` with the two flows, one-hour access and ID tokens, a one-day refresh token, user-existence errors suppressed, revocation on and no secret; `player1` and `player2` both `CONFIRMED`, enabled and verified. `terraform plan -lock=false` through the plan role afterwards: no changes. A sign-in attempt against `ci` with a wrong password answers `NotAuthorizedException` with the same message an unknown user gets, so the client is reachable; the sign-in with the real password is the owner's check, since only the owner holds it. The delegation of the zone followed the same day (Issue-51): `heat-sb.dcg-games.com` resolves publicly to the zone's four name servers. **The certificate was applied by the `Deploy` run on the merge of Issue-39's first pull request (PR-56), 2026-10-17 late: 4 added, the allow-list check passed, the whole apply including the validation wait inside two minutes.** Read back through `audit-heat-sandbox` by Issue-39's second pull request: the certificate `ISSUED` for `heat-sb.dcg-games.com` and `*.heat-sb.dcg-games.com`, RSA-2048, each name's validation `SUCCESS` through the same CNAME, which is the zone's one record beside NS and SOA; `terraform plan -lock=false` through the plan role afterwards: no changes. Renewal eligibility read as `INELIGIBLE` at that moment because no distribution used the certificate yet; the first stack's distribution changes that. **The domain and the Google identity provider (Issue-46's first pull request) are not applied yet: they apply on that pull request's merge, and this line changes in the pull request that follows.**

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/base/` | The resources, parameterised by name prefix, zone name, domain prefix and the Google client's two values: the zone, the certificate with its validation record and waiter, the pool, the `ci` client, the pool's domain and the Google identity provider (`sign_in.tf`), the outputs |
| `terraform/environment/sandbox-base/` | This root: the backend block with the key `environment/sandbox/base/terraform.tfstate`, one provider for the sandbox account, one module call with the sandbox's literals, the three variables, the outputs, the lock file, and `test-users.txt` |
| `terraform/environment/sandbox-base/terraform.tfvars` | Ignored by git: the sandbox account id and the Google client's two values, copied from `terraform.tfvars.example`, for a plan on a laptop without the private script |

No flag selects anything; the directory does (decision 0016).

## What it manages

In `heat-sandbox`, us-east-1, every resource tagged `Project=heat`, `Environment=sandbox`, `Stack=base`, `ManagedBy=terraform`:

- **The hosted zone `heat-sb.dcg-games.com`**, with `prevent_destroy`. Delegated from `dcg-games.com` by the organization layer in the `dcg-platform` repository: after the first apply, the HEAT session tells the dcg-platform session that the zone exists in `heat-sandbox`, that session reads the four name servers itself and writes them into the parent zone, and the delegation is live once the owner applies there (done 2026-10-17, Issue-51). Nothing but the certificate waits on the delegation.
- **The certificate for `heat-sb.dcg-games.com` and `*.heat-sb.dcg-games.com`**, in us-east-1, which is where CloudFront reads a certificate from. DNS-validated through one CNAME in the zone, which ACM issues identically for a wildcard and its base name, written once per name with `allow_overwrite`; the validation waiter holds the `certificate_arn` output until the certificate is issued, so nothing is ever created against a pending one. ACM renews it itself while the record stays and the certificate is in use. The zone name is on it beside the wildcard because the `dev` and `prod` bases compose the same module and their hostname is the zone apex, which a wildcard does not cover. Every distribution under the zone serves it: one validation, paid once, instead of minutes per stack (decision 0018).
- **The user pool `heat-sb-base-users`.** Essentials tier; email as the username, required and case-insensitive; self sign-up off; MFA off; Cognito's default password policy; administrator-only recovery; deletion protection and `prevent_destroy` (decision 0022).
- **The pool's domain, `heat-sb.auth.us-east-1.amazoncognito.com`**, managed login version 2: Cognito's own hostname for the managed login pages and the OAuth endpoints, free, with no certificate or record of HEAT's. A prefix is unique across every account in the region (`heat-sb` did not answer on 2026-10-17; `heat` did, so `prod` needs another). The owner's Google OAuth client names this hostname, so a change of prefix is a change there too. Every browser app client on the domain needs a managed login branding style, which the environment module creates beside each client (Issue-46's second pull request).
- **Google, the pool's one identity provider.** Scopes `openid email profile`; `email` and `email_verified` mapped, and Google's subject as the username, so the pool's email-as-username rule holds for players and their address is verified from the first sign-in. The client id and secret are the root's two Google variables; the secret is in this root's state, which decision 0020 accepts because the same identities could read it back from Cognito. One Google OAuth client per pool (decision 0018 as amended by Issue-44).
- **The app client `ci`.** Public; `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH`; access and ID tokens of one hour, refresh tokens of one day; user-existence errors suppressed; token revocation on. What the end-to-end tests sign in with. It uses neither the domain nor Google.

What it does not manage: the test users. They are data (decision 0020). The apply job creates them after `terraform apply` from `test-users.txt` beside this README, with `scripts/create-test-users.sh`: `admin-create-user` with the address verified and no invitation, then `admin-set-user-password --permanent`, both idempotent, with the password from the `sandbox-base` environment's secret `HEAT_TEST_USER_PASSWORD`. Adding a user is adding a line; changing the secret changes every user's password on the next apply. The two users today are `player1@heat-sb.dcg-games.com` and `player2@heat-sb.dcg-games.com`. Beside them, each sandbox stack's apply job mints its own user, `e2e-<issue>@heat-sb.dcg-games.com`, with a random password for that run, and deletes it with the stack (`scripts/e2e-user.sh`, Issue-38). Nor the browser app clients: each stack's own, in the environment module.

## Variables

| Variable | From, in the pipeline | From, on a laptop |
| --- | --- | --- |
| `workload_account_id` | The repository variable `HEAT_SANDBOX_ACCOUNT_ID` | The private script in `docs/private/`, or `terraform.tfvars` |
| `google_client_id` | The `sandbox-base` environment's variable `HEAT_GOOGLE_CLIENT_ID` | The same two places: decision 0020 allows a git-ignored copy of the sandbox base's values |
| `google_client_secret` | The `sandbox-base` environment's secret `HEAT_GOOGLE_CLIENT_SECRET` (sensitive) | The same |

One name per value in every environment; the environment supplies the value, so `dev`'s and `prod`'s roots read the same names from their own environments (decision 0020). An environment without the two Google values hands the root empty strings, which the module's variables refuse by name. The secret is sensitive as far as the plan is concerned: every plan the workflow writes shows the provider's details as `(sensitive value)`.

## Outputs

`zone_id`, `zone_name_servers`, `certificate_arn`, `user_pool_id`, `user_pool_arn`, `user_pool_endpoint`, `login_host`, `ci_client_id`. None is secret and none carries the account id. The apply job reads `user_pool_id` for the test-user step; the per-issue stacks read the pool and its `ci` client by name through data sources (`terraform/environment/sandbox/main.tf`), never through this root's state, read the zone and the certificate the same way, and derive the login host from the same `heat-sb` literal.

## Who applies it

The pipeline, and nothing else (`docs/process/code-changes.md`, rule 18), in `.github/workflows/deploy.yml`:

- **On a pull request to `main`**, a job under the `sandbox-base` GitHub environment checks out the pull request's head, assumes `heat-sandbox-plan`, runs `terraform plan -lock=false`, runs the allow-list check (`scripts/check-plan-resource-types.mjs` against `terraform/allowed-resource-types.txt`), and writes the plan to the job summary and to one comment on the pull request, edited in place on every push (`scripts/post-terraform-plan.sh`). The event is `pull_request_target`, so the run carries `main`'s ref and the environment's `main`-only branch policy admits it (decision 0020). Two consequences: a change to the workflow itself takes effect for pull requests only once it is on `main`, and Dependabot's pull requests get no plan.
- **On a push to `main`**, a job under the same environment assumes `heat-sandbox-apply`, plans, runs the same check, writes the plan to the job summary, applies exactly that plan, and creates the test users. One apply at a time per root, never cancelled.

Both jobs pass the environment's `HEAT_GOOGLE_CLIENT_ID` and `HEAT_GOOGLE_CLIENT_SECRET` to Terraform as `TF_VAR_google_client_id` and `TF_VAR_google_client_secret`, and the account id as `TF_VAR_workload_account_id` from the repository variable `HEAT_SANDBOX_ACCOUNT_ID`, which is replaced by `<account id>` in every plan the workflow posts. The role ARNs are not stored: each is the account id plus the committed name (`terraform/bootstrap/README.md`).

**The owner's steps, once, before the first merge** (done for Issue-37 on 2026-10-17): the environment with its secret and its branch policy. From the checkout or a worktree, so that `gh` finds the repository:

```powershell
gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/sandbox-base -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/sandbox-base/deployment-branch-policies -f name=main -f type=branch
gh secret set HEAT_TEST_USER_PASSWORD --env sandbox-base
```

`gh secret set` prompts for the value; it is typed, never pasted into a chat or a file. The password must meet Cognito's default policy: at least eight characters with an upper-case letter, a lower-case letter, a number and a symbol.

**The owner's steps for Google, once, before Issue-46's first pull request merges.** In the Google Auth Platform (the Cognito guide's steps, verified against the Google console on 2026-10-02 and read 2026-10-17): a project with audience External; under Branding, `amazoncognito.com` as an authorized domain, the registrable domain, not the full hostname; under Data Access, the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`; under Clients, a Web application client with the authorized JavaScript origin `https://heat-sb.auth.us-east-1.amazoncognito.com` and the authorized redirect URI `https://heat-sb.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`. Google shows the client secret once, at creation. The publishing status stays Testing: with only the three basic scopes, test users need not be listed and see no warning. Then, from the checkout or a worktree:

```powershell
gh variable set HEAT_GOOGLE_CLIENT_ID --env sandbox-base --body "<the client id>"
gh secret set HEAT_GOOGLE_CLIENT_SECRET --env sandbox-base
```

Changes to Google's authorized origins and redirect URIs "can take from five minutes to a few hours to take effect"; a mismatch answers `redirect_uri_mismatch`. The `dev` and `prod` pools get a Google client each, against their own domains, under the same two names on their environments (Issues 40 and 41).

## Planning on a laptop

The agent plans this root before pushing a change to it (decision 0017, guardrail 5), through its `plan-heat-sandbox` profile, which may read this account's state prefix and nothing it should not. The root takes the account id and the two Google values, all three from the private script, whose copy of the Google values is the one decision 0020 allows for the sandbox base. From the worktree, in PowerShell:

```powershell
. C:\Users\chanc\IdeaProjects\HEAT\docs\private\heat-tfvars.ps1 -Environment sandbox
$env:AWS_PROFILE = "plan-heat-sandbox"
cd <the worktree>\terraform\environment\sandbox-base
terraform init
terraform plan -lock=false
```

`-lock=false` because the plan role may not write the lock file, and a read-only plan needs no lock. The private script sets more variables than this root declares; Terraform warns about none of them, because `TF_VAR_*` values for undeclared variables are ignored.

## Verification

After the first apply, the agent reads the account through `audit-heat-sandbox`: the zone with its four name servers and no record but NS and SOA; the pool with the settings above; the `ci` client with its flows and validities; the two users, `CONFIRMED` with `email_verified` true; and nothing else created. Then a password-flow sign-in with the `ci` client as `player1` returns tokens, which proves the pool, the client and the test-user step together. Then `terraform plan -lock=false` through the plan role shows no changes. Then the dcg-platform session is told the zone exists. After the apply that adds the certificate, the agent reads it back as `ISSUED` for both names, with the validation CNAME in the zone, and the plan through the plan role again shows no changes. After the apply that adds the domain and Google, the agent reads the domain back as `ACTIVE` with managed login version 2 and the provider `Google` with its scopes and mapping, `https://heat-sb.auth.us-east-1.amazoncognito.com/login` answers, and the plan through the plan role shows no changes, which also proves that the provider's computed details cause no drift. The status line at the top of this file changes in a commit after each of these.

The test password is the owner's. For the sign-in check the owner runs it, or hands the agent a session in which the secret is an environment variable; the value itself is never pasted into a chat.

## Facts checked

All read on 2026-10-17; the pool's facts are in decision 0022.

- **`pull_request_target`** (GitHub, "Events that trigger workflows"): the run is "in the context of the default branch of the base repository", `GITHUB_REF` is the default branch and `GITHUB_SHA` its last commit; "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities", the risk decision 0020 records as accepted while every author is trusted. Heads from other repositories are refused by the job's condition.
- **Contexts in a job's keys** (GitHub, "Contexts reference"): `jobs.<job_id>.environment` and `jobs.<job_id>.concurrency` may use `matrix` and `vars`; `jobs.<job_id>.strategy` may use `vars`, which is how the account id variable reaches the matrix. Indexing the `secrets` context by an expression is not documented, so the test-user step names its secret, and so the Google values carry one name in every environment.
- **DNS validation** (ACM user guide, "DNS validation", read 2026-10-17): a wildcard and its base domain get the same record name and value, which the guide's table marks "Identical"; the CNAME "must be added to your DNS database only once" and ACM "automatically renews your certificate as long as the certificate is in use and your CNAME record remains in place"; a validation not completed "within 72 hours" times out and the certificate must be requested again, which is why the certificate waited for the delegation.
- **The prefix domain** (Cognito developer guide, "Using the Amazon Cognito prefix domain for managed login"): the format `<prefix>.auth.<region>.amazoncognito.com`; "There isn't a cost difference between the Amazon Cognito domain option and the custom domain option"; "For cases of third-party IdP redirects and client-credentials flows, the prefix domain has little visible effect"; created with `create-user-pool-domain --managed-login-version 2`. Availability is not queryable: `describe-user-pool-domain` answers an empty description for a free prefix and for another account's alike, so the check made was whether the hostname answers.
- **Google as a provider** (Cognito developer guide, "Add Google as a social identity provider", "Last verified against the provider console: October 2, 2026"): authorized domains are "the registrable domains of your user pool, not the full URLs", `amazoncognito.com` for the prefix domain; the client is a Web application with the origin `https://<your-prefix>.auth.<region>.amazoncognito.com` and the redirect URI `.../oauth2/idpresponse`; "For clients created after June 2025, Google shows the client secret only once"; the authorized scopes `profile email openid`; "If you don't map `email_verified`, Amazon Cognito treats the email as unverified"; "if your app requests only the basic sign-in scopes (`openid`, `email`, `profile`), test users don't need to be listed, see no warning, and their authorizations don't expire"; redirect changes "can take from five minutes to a few hours to take effect".
- **The provider** (hashicorp/aws 6.69.1, `terraform providers schema -json`): `aws_cognito_user_pool_domain` has `managed_login_version`; `aws_cognito_identity_provider` has `provider_details` (a map, not marked sensitive, so the root's sensitive variable is what keeps the secret out of the plan text) and `attribute_mapping`; `aws_cognito_managed_login_branding` exists, with `use_cognito_provided_values`, for the stacks' clients.
- **Comment length** (GitHub REST, "Issue comments"): a comment body holds up to 65,536 characters; the workflow cuts a longer plan and points at the job summary, which holds the whole of it.
- **`terraform providers lock`** regenerates the lock file for Windows and Linux so that the owner's machine, the agent's and the runner resolve the same provider:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
