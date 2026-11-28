# Terraform: the detail

The detail behind `docs/standards/terraform.md`: what its rules need when their kind of work is done, not at a session's start, the whole of the rules it writes as a single line, what it holds back and why its rules are as they are. Its rules are that document's, by their numbers there; each section here is named for the rule it serves (decision 0060, as amended by Issue-428).

Nothing loads this file. It is read by section when the work names it (`docs/process/sessions.md`, rule 18), and whole by the review skill and the checkup: "Rules 5 and 8" when a variable, an output or a resource type is added; "Rule 13" when a provider, a lock file or the Terraform pin moves; "Rule 17" when a tflint or trivy finding is fixed or excused; "Held back" when an excuse in `terraform/.trivyignore` is added or removed; "Why" when a rule's reason is in doubt.

## Rule 5: variables and outputs

Every variable has a description and a type (tflint, `terraform_documented_variables`, `terraform_typed_variables`) and, where its shape is known, a validation, which no linter checks. Every output has a description where its name does not say enough. The description says where the value comes from in the pipeline and on a laptop.

## Rule 8: the allow-list

A delete of a type not on the list is not refused by the plan-time check.

## Rule 13: the lock files and the pins

The lock files are written by `terraform providers lock -platform=windows_amd64 -platform=linux_amd64`, and Dependabot's roots are in `.github/dependabot.yml`. The pinned release runs in the floor and the applies alike; the pin moves to the latest release in a commit of its own, in a pull request of versions and pins, and the owner's machine tracks it.

## Rule 17: the floor's checks, and excuses

"Build and test" runs `terraform fmt -check -recursive`, `init -backend=false` and `validate` in every root; tflint over every root and module from `terraform/` with the `terraform` ruleset's recommended preset and the AWS ruleset, pinned in `terraform/.tflint.hcl`; and trivy's misconfiguration checks over the same roots and modules from the same directory, `trivy config .`, pinned twice, the release in the workflow and the checks bundle in `terraform/trivy.yaml`, failing on a finding of any severity. Every pull request's and apply's plan runs `scripts/check-plan-resource-types.mjs`.

A finding that is deliberate carries its excuse with its reason on the lines above it. For tflint that is a `tflint-ignore` annotation, as the bootstrap roots' unused caller-identity data source carries, which exists to force the account check. For trivy it is `trivy:ignore:<id>` above the one resource the excuse is about, as the boundary's `s3:*` and the client bucket's missing versioning carry, or above a root's `module` block to excuse that root alone, as the sandbox root's point-in-time recovery does; an excuse that is a scale-down a rule already states, true of every instance, is the check's id in `terraform/.trivyignore` instead, which "Held back" lists.

What trivy does not see: a resource keyed by `for_each` on a value read with `file()`, because its evaluator does not know the function (checked 2026-11-02, trivy 0.76.1), so the function, its log group, role, permissions, routes and integrations, keyed on `manifest.json`, are checked by review and the plan-time allow-list alone.

## Held back

How an item here is checked is `docs/runbooks/checkup.md`, rule 5.

- **The scale-downs trivy would fail, excused by id in `terraform/.trivyignore`** (standing scale-downs, decision 0063, under rule 12): encryption with a customer-managed key on the buckets, the tables and the log groups, which costs at rest (rule 12; decision 0008 for the state bucket); a WAF on the distribution, which costs at rest (rule 12); CloudFront access logs and S3 server access logs, a destination per environment with no reader, where the gateway's access log and the function's log are the request record. Each leaves the ignore file, and this list, in the pull request that builds the thing.

## Why

The layout rules are decision 0016's and 0018's reasons restated as what to write: one directory remembers one backend, so a flag that selects an environment is a flag that can select the wrong one, and a module that found its own values would hide which root chose them. The naming and tag rules come from the guardrails: the boundary and the plan role are keyed on the prefix (decision 0019), so a resource outside it is one the pipeline cannot create and one the agent cannot read the logs of.

The guardrail rules are decision 0017's five guardrails as they fall on the person writing a change: the allow-list file and the boundary are where a new resource and a new service are reviewed, and the least-privilege policy is what keeps a function's role from being the apply role's twin. Nothing at rest is the serverless shape's own test (decisions 0012 and 0013): a stack that costs nothing while idle can exist per issue.

The floor has tflint because accepted practice is weighted over the code as it was (Issue-145): `fmt` and `validate` are syntax, and tflint is the published linter for what syntax cannot see. The linter is the floor and the standard starts above it, as lint and `typescript.md` do.

The floor has trivy, the scanner the same accepted practice puts beside the linter (Issue-157), run from its release archive with its Sigstore signature verified by cosign, the check trivy's own document gives; actionlint's archive is verified through GitHub's attestation API instead, which the `aquasecurity` organization's IP allow list closes to a runner's token. A finding that is a scale-down the rules already state is excused where the excuse is read: on the resource when it is about that resource, in the ignore file when it holds everywhere. The scanner's blind spot, a `for_each` over `manifest.json`, is written into rule 17 so that nobody takes the function for checked.
