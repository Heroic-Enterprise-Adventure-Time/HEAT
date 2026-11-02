# 0035: The account ids reach the pipeline as repository secrets

- **Status:** Decided
- **Date:** 2026-11-02
- **Settles:** Issue-177: how the four AWS account ids reach the workflows once the repository is public and every run's log is public with it. Amends 0011 ("Account ids and role ARNs live in GitHub Actions repository variables") and 0019 ("account ids as the only variables"); the role ARN stays the account id plus the committed role name.

## Decision

**Each account id is a repository secret, `HEAT_<ENVIRONMENT>_ACCOUNT_ID`, and no workflow reads it from a variable.** GitHub masks a secret's value in every log line from the first, including the echo of a step's `env` block, which is where the ids were printing: GitHub writes that block before the step's own `::add-mask::` runs, so a mask inside the step was always one line too late. The four repository variables of the same names are deleted after the first apply from `main` that read the secrets (Issue-178), because a pull request's plan runs `main`'s copy of `deploy.yml`.

**Where a job's row decides the account, the job's first step picks the secret and refuses to run without it.** The `secrets` context is not available in `strategy`, so a matrix row cannot carry the id. The step holds both secrets in its `env`, chooses by the row's root, fails if the chosen value is empty, and writes `ACCOUNT_ID` and `TF_VAR_workload_account_id` to `GITHUB_ENV` once. The guard reads exactly the value the job will use.

## Considered and not chosen

- **Keeping the variables and masking in the step.** This was the shape until Issue-177. It masks every line after the mask step and none before it, and the `env` echo comes before. Rejected because the leak was the one it could not close.
- **One environment secret, `HEAT_ACCOUNT_ID`, supplied by each GitHub environment** (the pattern of decision 0020 for the Google client). Clean for `dev`, `prod` and `sandbox-base`, which run under an environment of their own, but the sandbox stacks run under `sandbox-<issue>` environments the workflow creates, which cannot hold a secret the workflow has no admin token to set, and the sweep and destroy jobs run under none. Rejected for needing two mechanisms where one repository secret per account needs one.
- **Indexing the secrets context by the row, `secrets[matrix.secret]`.** Not documented in GitHub's contexts reference (read 2026-11-02), and flagged by scanners because a non-literal index hands the whole secrets context to the runner. Rejected.
- **A conditional expression in the job's `env`, `matrix.root == 'dev' && secrets.HEAT_DEV_ACCOUNT_ID || secrets.HEAT_SANDBOX_ACCOUNT_ID`.** The first shape of the pull request. `||` falls back to the other secret when the row's is empty, so the guard that followed it passed on a missing dev secret and the job failed later at the role assume with the wrong account in the error. Replaced by the step above after the review of PR-179.

## Where it is described

`docs/README.md`, rule 9; `docs/architecture/overview.md`, "Environments"; `docs/standards/terraform.md`, rule 4; `terraform/bootstrap/README.md`, "On the GitHub side"; `.github/workflows/deploy.yml`, `release.yml`, `sandbox.yml` and `verify-apply-roles.yml`; Issue-178 for the variables' deletion.
