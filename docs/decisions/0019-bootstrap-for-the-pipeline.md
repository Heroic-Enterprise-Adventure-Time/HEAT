# 0019: Bootstrap for the pipeline: the boundary is an allow-list, a GitHub environment per stack, the agent's plan path

- **Status:** Decided
- **Date:** 2026-10-16
- **Amends:** 0017, the shape of the apply role's permissions boundary, the sandbox row of its table, and one line of its facts; 0018, the sandbox GitHub environment in "What is owed".

## Decision

Issue-36 builds the roles decision 0017 describes. Five choices were made while building them that 0017 left open or worded differently.

**The boundary is an allow-list with explicit denies.** 0017 describes the apply role's permissions boundary as a deny-list of the services that cost money while idle. The boundary built is the other way round: it allows the service namespaces the decided shape uses, Lambda, API Gateway, DynamoDB, S3, Cognito, CloudFront, ACM, Route 53, CloudWatch and its logs, Systems Manager parameters, X-Ray, IAM and the caller-identity call, and nothing else. On top of that ceiling it denies outright the services 0017 names, EC2 as a whole among them, so that no later widening of the list and no resource policy in the account lets one through. The boundary is self-protecting, in the pattern the IAM user guide gives for delegating with boundaries: a role under it can create or re-bound a role only with this same boundary, cannot remove a boundary from any role, cannot touch the plan role, the apply role, the budget's role, the boundary, the freeze policy or the identity provider, cannot write roles or policies outside the environment's own name prefix, and cannot create users, keys or identity providers, assume other roles, or touch Budgets, the account or the organization. The consequence for the environment stacks: every role they create, a function's execution role included, carries the boundary. Adding a service is a change to the list in the bootstrap module, applied by the owner.

**A GitHub environment per sandbox stack.** Each per-issue stack's jobs run under the environment `sandbox-<issue>`, and the sandbox account's apply role trusts the pattern `sandbox-*`. GitHub creates an environment the first time a workflow references it, with no protection rules, so no step by the owner is needed, and each pull request then shows its own deployment with the stack's URL. `dev` and `prod` are trusted exactly.

**The agent's plan path.** Each plan role trusts the management account's SecurityAudit role through the same ARN pattern the organization's AuditRole trusts, and the agent reaches it through a profile chained from the same key, `plan-heat-<environment>`. Cross-account assumption needs an allow on both sides, so the SecurityAudit permission set's inline policy in the `dcg-platform` repository gains `arn:aws:iam::*:role/heat-*-plan` beside `AuditRole`. That is one read-only line there; AuditRole and PlatformAdminRole are unchanged.

**The plan role reads configuration, never data.** AWS's `ReadOnlyAccess` is the base, and an inline policy denies what in it is data: table items, objects in every bucket but the account's own state prefix, secret values, message receipt, log lines outside the environment's own log groups. Parameter values stay readable, because parameters are non-secret by decision and a plan refreshes them. User-pool records are denied in `dev` and `prod`, where they are players' records, and allowed in the sandbox account, where every user is a test user that Terraform creates and must read back.

**One state prefix per account, and account ids as the only variables.** Each account's roles may use `environment/<environment>/` in the state bucket: the plan role reads, the apply role reads, writes and deletes, for the lock file. The sandbox base's state is `environment/sandbox/base/terraform.tfstate`, under the same prefix as the per-issue keys of 0018. The bucket policy names the roles by ARN, so an account's bootstrap root is applied before the backend stack lists it. The workflows store no role ARNs: each is built from the account's id variable and the name the module gives the role.

The budget action attaches a deny-all policy to the apply role at 100% of actual spend, through a service role that trusts the Budgets service for this account's budgets only and may attach or detach that one policy on that one role. The action stops new resources; it does not stop what is running. A kill switch for a function that keeps invoking belongs to the environment stack, Issue-38.

## Considered and not chosen

**A deny-list alone**, as 0017 words it. A deny-list is what was thought of on the day it was written, and the costly surprise is the service that was not. An allow-list of what the shape uses is short, complete by construction, and makes a new service a reviewed change.

**One `sandbox` environment** for every stack, 0017's table. It needs nothing GitHub does not already do for `sandbox-*`, and loses the per-stack deployment record on the pull request. The security is the same: any branch can reference either name.

**Role ARNs as repository variables**, the pattern of Issue-12's `HEAT_DEV_DEPLOY_ROLE_ARN`. Five more values to set by hand and keep in step with the module; the ARN has only two parts, and the names are committed.

**The bucket policy with `Principal: *` and an `aws:PrincipalArn` condition**, which would let the policy name a role before it exists. Naming the role ARN directly reads as what it is and is validated by IAM; the cost is an ordering, bootstrap root before backend, which the README states.

**User-pool reads denied everywhere**, or allowed everywhere. Denied everywhere, the sandbox base's test users cannot be Terraform's. Allowed everywhere, the plan role and the agent through it can list players' records in `prod`.

**The managed policy on the budget's service role.** 0017 says AWS recommends its managed policy for the role Budgets assumes. The policy that sentence had in mind, `AWSBudgetsActionsWithAWSResourceControlAccess`, is for the person configuring actions: it grants `budgets:*` and `iam:PassRole`. The service role gets the two IAM actions the Cost Management guide's example lists, scoped to the apply role and the freeze policy.

## Facts checked

All read on 2026-10-16.

- **Both sides of a cross-account grant** (IAM user guide, "Cross account resource access in IAM"): "In cross account access, a principal needs an `Allow` in the identity policy and the resource-based policy."
- **Boundaries** (IAM user guide, "Permissions boundaries for IAM entities"): effective permissions are the intersection of identity policy and boundary, and an explicit deny in either wins; resource-based policies that grant to a role ARN are limited by the boundary's implicit deny, those that grant to a role session ARN in the same account are not; the delegation example uses `iam:PermissionsBoundary` in a condition and denies editing the boundary policy and removing boundaries.
- **`ReadOnlyAccess`** (AWS managed policy reference, v190, edited 2026-09-24): grants `dynamodb:Get*`, `Query`, `Scan`, `BatchGet*`, `PartiQLSelect`, `s3:Get*`, `s3:List*`, `sqs:Receive*`, `ssm:Get*`, `logs:Get*`, `FilterLogEvents`, `StartQuery`, `cognito-idp:AdminGet*` and `List*`, `lambda:Get*`; does not grant `secretsmanager:GetSecretValue` or `kms:Decrypt`.
- **GitHub's subject claim** (GitHub, "OpenID Connect reference"): `pull_request` is in the subject only when the job has no environment; a job with an environment carries `environment:NAME`. **Environments** (GitHub, "Managing environments for deployment"): a workflow that references an environment that does not exist creates it, with no protection rules; on the Team plan private repositories have environments with branch and tag policies. **Branch policies** (GitHub REST, "Deployment branch policies"): a policy is a `name` pattern with `type` `branch` or `tag`, and needs `custom_branch_policies` on the environment.
- **Budget actions** (Cost Management user guide, "Configuring a budget action", "Setting up a role", "Reviewing and approving your budget action", and the policy examples): an action applies an IAM policy to users, groups or roles, automatically or after approval; the service role's trust names `budgets.amazonaws.com` with `aws:SourceAccount` and `aws:SourceArn` on `budget/*`; the permissions example lists the six attach and detach actions; a completed action is reversed from the action history and reset to be evaluated again in the same period. **Pricing** (AWS Budgets pricing page): "Your first two action-enabled budgets are free (regardless of the number of actions you configure per budget) per month", then $0.10 a day each; the page does not say whether that is per account or per organization.
- **Terraform's S3 backend** (backend documentation): needs `s3:ListBucket` on the bucket, `GetObject` and `PutObject` on the key, and with `use_lockfile` also `DeleteObject` on `<key>.tflock`; `DeleteObject` is not needed on the state object itself; the workspace prefix is `env:`.
- **`aws_budgets_budget_action`** (provider documentation): `action_type` `APPLY_IAM_POLICY`, `approval_model` `AUTOMATIC`, `notification_type` `ACTUAL`, `action_threshold` as a percentage or absolute value, `definition.iam_action_definition` with `policy_arn` and `roles`, a required `subscriber`, and `execution_role_arn` in the same account.
- **`moved` blocks** (Terraform documentation, "Refactoring", and checked with Terraform 1.14.6 the same day): a `moved` block whose target no longer exists in the configuration validates and plans cleanly; HashiCorp recommends retaining historical `moved` blocks.

## Where it is described

`terraform/bootstrap/README.md` and the module `terraform/modules/bootstrap/`, `terraform/backend/README.md`, `docs/architecture/overview.md` "Environments". The workflow `.github/workflows/verify-apply-roles.yml` is the check; the pipeline's workflows (Issue-37) use the roles.
