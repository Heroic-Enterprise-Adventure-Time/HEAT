# 0020: Secrets live in GitHub environments, enter AWS through a base root, and pull request plans run under the target environment

- **Status:** Decided. Amended by 0035 on 2026-11-02: the account ids are repository secrets, so "There are no repository secrets" below now holds for every other secret, none of which is a repository's. The repository went public on 2026-11-02 (Issue-178), so outside pull requests can now be opened: the plan job refuses heads from other repositories, as "The residual risk" below requires (`.github/workflows/deploy.yml`).
- **Date:** 2026-10-17
- **Amends:** 0008, "the state holds no secrets by design": the base roots' state holds the Cognito secrets. 0017, the plan job's identity: a pull request's plan of a permanent root runs under that root's GitHub environment, and the plan roles trust that subject beside `pull_request`. 0019, the sandbox plan role's carve-out for user-pool records: test users are not Terraform's, so the carve-out closes.

## Decision

**Where a secret lives.** In the GitHub environment of the deployment it belongs to: `sandbox-base`, `dev`, `prod`. The per-issue environments `sandbox-<issue>` hold none. There are no repository secrets. A secret has the same name in every environment, so the workflow references one name and the environment supplies the value.

**How a secret reaches AWS.** Through a base root, the one place in each account that holds what every stack shares: `terraform/environment/sandbox-base` in the sandbox account, and the `base` module inside the `dev` and `prod` roots. The apply job runs under the environment and passes the value as a Terraform variable. Where the resource is a secret store with a write-only argument (Secrets Manager, Parameter Store), the value never enters state, and environment roots and functions consume it by name at runtime. Where the resource needs the raw value in its own configuration, today the Cognito identity provider's client secret, the value is in that root's state. Environment roots never take a secret value. If a resource outside a base root ever must, a repository-level secret holds the sandbox value and `dev` and `prod` environment secrets override it by the same name; that is the fallback, not the rule.

**Test users are data, not configuration.** The apply job creates them with idempotent CLI calls (`admin-create-user`, `admin-set-user-password --permanent`) from a committed list and the environment's password secret, in the sandbox and `dev`, never in `prod`. Terraform does not hold them, so no plan role needs to read user records, and the denial of user records in 0019 now applies in every account.

**Where a plan runs.** A permanent root is planned in two places: on the pull request and, immediately before the apply, in the apply job. The pull request's plan runs under the root's environment through the `pull_request_target` event, whose run carries the default branch's ref and executes the default branch's workflow file; `dev`'s `main`-only branch policy therefore admits it, the environment's secrets are available, and the plan sees real values. The plan role is what that job assumes, and its trust gains the `environment:<name>` subject beside `pull_request`. A per-issue stack is planned and applied on each push, under its own environment, and needs no secret.

**The local plan.** The agent plans per-issue stacks locally before pushing, through the `plan-heat-sandbox` profile; they take no secrets. The permanent roots' plans are the pull request's, so the agent never needs `dev`'s or `prod`'s values. For the sandbox base, a git-ignored copy of its secrets in the owner's private `TF_VAR_*` script lets the agent or the owner plan it locally. This is a deliberate scale-down of the overview's "secrets never cross a laptop", scoped to the sandbox, where the plan role can read the same values from Cognito in any case.

**What that leaves in state, and who can read it.** The base roots' state holds the Cognito identity provider's client secret. A state file is readable by the owner's `Admin` session in `heat-platform` and by the environment's plan and apply roles, and Cognito returns the same secret to anyone who may describe the provider, which every plan role may, because `terraform plan` must. The readers are therefore the same with or without state, and a customer-managed key on the bucket would protect against nobody new; SSE-S3 stays. One gap is recorded rather than closed: reads of the state objects are not audited, since the organization's trail records management events only.

**The residual risk.** `pull_request_target` runs the pull request's Terraform with the environment's credentials, and Terraform executes provider code. A hostile pull request could act as that job. This is safe only while every author is trusted, which is the model 0017 already accepts for one human collaborator and an agent that pushes as that human. If outside pull requests are ever accepted, the plan job must first refuse heads from other repositories.

**The end state.** Write-only arguments are the right mechanism and the planned replacement: the value passes through Terraform to the resource without touching state or plan, and the pull request's plan needs no secret at all. The provider has them for fourteen resources and none for Cognito (upstream issue 48319, opened 2026-06-10). When it does, the base roots move to them and this record's state paragraph goes stale on purpose.

## Considered and not chosen

**Repository secrets as Terraform variables.** The plain shape: every plan, including the pull request's, reads the secret, which is what a plan needs. Any branch's workflow can read a repository secret, so `prod`'s client secret would be readable from any branch. In the sandbox account that adds nothing, since a branch runs as the sandbox apply role; for `prod` it is new. Rejected for `prod`, and one rule for all three is simpler than two.

**Terraform never holding the value.** A placeholder in the configuration, `ignore_changes` on the one map key, and the apply job setting the real value afterwards. Keeps state clean and plans secret-free today. Rejected because it makes GitHub's store the truth for the value while Terraform is the truth for everything else, needs a stated exception to 0017's "nothing is excluded with `ignore_changes`", and is what write-only arguments do properly.

**A plan environment per account**, `dev-plan`, with the same secrets and no branch policy, trusted by the plan role only. It separates secrets from deployment rights, which one environment cannot. Rejected because an environment every branch may run under is one every branch's workflow can read, the same exposure as repository secrets, and `pull_request_target` reaches the real environment without it.

**No client secret.** Cognito's Google provider is a confidential client to Google; its create and update calls require `client_secret`.

**Google registered by hand in the Cognito console.** No secret anywhere but Google and Cognito. Rejected: Terraform owns the infrastructure, and every app client would depend on a console step having been done.

**Reading the secret from Secrets Manager at plan time.** Every plan still reads the value, the plan roles are denied secret values on purpose, and the value lands in state regardless.

**Terraform-managed test users in `dev`.** The `dev` plan role is denied user records (0019), so Terraform could not refresh them and `dev`'s plan would fail. The CLI route works the same in every account and lets the sandbox carve-out close.

**A customer-managed KMS key on the state bucket.** The revisit 0008 named. The readers are the same set with or without it, so it buys nothing here; revisited if the reader set ever widens.

## Facts checked

All read on 2026-10-17.

- **Write-only arguments** (Terraform language documentation, "Write-only arguments"; the installed provider's schema, `terraform providers schema -json` with hashicorp/aws 6.69.1): Terraform 1.11 or later; the provider pairs each with a `_wo_version` argument that is stored and diffed; fourteen write-only arguments exist, among them `aws_secretsmanager_secret_version.secret_string_wo` and `aws_ssm_parameter.value_wo`, and none on `aws_cognito_identity_provider`, `aws_cognito_user` or `aws_cognito_user_pool_client`. Upstream issue 48319 asks for `client_secret_wo` on the identity provider; one vote, no reply, no pull request.
- **State and sensitive data** (HashiCorp, "Sensitive data in state"): "If you add secret values directly to your configuration, Terraform stores those secrets in its state and plan files"; the recommendations are a remote backend, encryption at rest, access control and audit logs; ephemeral values and write-only arguments are the way to keep a value out of state entirely. AWS's Terraform provider best-practices guide: use server-side encryption on the state bucket, limit direct state access, route changes through a pipeline, and "avoid storing secrets in state, use AWS Secrets Manager instead".
- **Cognito returns the secret** (API reference, `DescribeIdentityProvider` and `IdentityProviderType`): the describe response's `ProviderDetails` for Google includes `client_secret`; `UpdateIdentityProvider` takes the whole map.
- **`ignore_changes`** (Terraform, "lifecycle"): "only literal values can be used because the processing happens too early for arbitrary expression evaluation"; a single map key may be named.
- **GitHub secrets** (GitHub REST, "Actions secrets"; the `gh secret` and `gh variable` manuals; GitHub, "Secrets reference" and "Variables reference"): a secret is returned "without revealing its encrypted value" and `gh secret` has only `list`, `set` and `delete`, while `gh variable get` returns a variable's value at repository or environment level; "if a secret with the same name exists at multiple levels, the secret at the lowest level takes precedence", environment over repository over organization, and the same for variables; `secrets` and `vars` are separate contexts.
- **Environments and events** (GitHub, "Deployments and environments", "Events that trigger workflows"): a deployment branch policy "is matched against the `GITHUB_REF` of the workflow run"; a `pull_request` run has `refs/pull/<n>/merge`; a `pull_request_target` run "runs in the context of the default branch of the base repository", with `GITHUB_REF` the default branch, and "running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities".
- **Dependabot** (GitHub, "Troubleshooting Dependabot on GitHub Actions"): runs triggered by Dependabot events get a read-only token and "the only secrets available to the workflow are Dependabot secrets". Whether such a run can mint an OIDC token is not documented; the pull request's plan of a secret-free environment root is the case that matters, found out on the first Dependabot pull request.

## Where it is described

`docs/architecture/overview.md`, "Environments". `docs/process/code-changes.md`, rules 18, 23 and 24. `terraform/bootstrap/README.md`, "On the GitHub side" and the plan role's trust. The workflow under `.github/workflows/` once Issue-37 creates it.
