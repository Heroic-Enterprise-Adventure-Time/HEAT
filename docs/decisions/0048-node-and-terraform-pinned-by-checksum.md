# 0048: Node and Terraform run at one exact release, checked against a pinned checksum, in every job

- **Status:** Decided; the pins' tracking by Issue-275, the checkup's rule 12
- **Date:** 2026-11-09
- **Settles:** Issue-258 and the instance of `docs/process/best-practices.md` rule 14 that Issue-267 names, from the checkup of 2a146cf: `hashicorp/setup-terraform` with no version took the latest Terraform, and `actions/setup-node` took Node 24 by its major, each downloading with no check, in the jobs that plan and apply `prod`.
- **Reverses:** `docs/standards/terraform.md` rule 13 and ci.yml's comment, which ran the latest Terraform in the pipeline on purpose.

## Decision

**Two composite actions replace the setup actions.** `.github/actions/node` installs Node 24.22.2 and `.github/actions/terraform` installs Terraform 1.17.1, each from its publisher's release archive, checked with `sha256sum --check --strict` against a checksum written in the action before anything in it runs. The checksum was taken from the release's signed checksum file after its signature was verified. Both refuse a runner other than Linux x64, the platform of their archives, and the Node action refuses a pin whose major is not `.node-version`'s.

**In every job, not only the role-holding ones.** The build jobs make the bundles the apply jobs deploy, and ci.yml's Terraform floor checks the binary that applies.

**Called as `$/`** (decision 0047), so a `pull_request_target` plan runs `main`'s pins, never a pull request's.

**A bump is a pull request of its own,** moving the version and its checksum together, with the signature check repeated and recorded in the action's comment (`docs/standards/typescript.md`, rule 1; `docs/standards/terraform.md`, rule 13).

**No npm cache.** setup-node's `cache: npm` goes with it; `npm ci` checks every package against `package-lock.json`'s hashes on every run. A cache is a further input to the role-holding jobs, and its cost was not measured; it is reopened with the timings if the runs prove slow.

## Considered and not chosen

**setup-node with an exact version.** The action checks nothing on a tool-cache miss, and the image's cache holds only the newest 24.x (24.22.2 in image 20261101, whose default Node on `PATH` is 22.23.4), so an exact version would download, unchecked, after each image update.

**The image's own Node.** Issue-258's first option. The `PATH` Node is 22, not `.node-version`'s 24.

**The newest patch, its signature verified on every run.** The owner's first preference, for less upkeep, weighed and refused by the owner: a signature proves who published a release, not that it is sound, so a compromised but signed release would run under the roles on the next job, where a pin runs it only after a reviewed bump.

**One shared download script under `scripts/`,** raised by the review of PR-274. A script under `scripts/` runs from the checked-out tree, which on a `pull_request_target` plan is the pull request's head, so a pull request could change what runs beside the role; the two actions keep their few lines each.

## What it leaves open

- Nothing tracks the two pins: Dependabot followed setup-node and setup-terraform, and does not read an `env:` block. A pin falling behind is a defect under typescript.md rule 1 and terraform.md rule 13; how it is noticed is a follow-up issue on the checkup.
- The owner's machine runs Terraform and Node of its own; it tracks the pins by hand.

## Facts checked

- `hashicorp/setup-terraform` at dfe3c3f (v4.0.1), `lib/setup-terraform.js`, read 2026-11-09: downloads with `tc.downloadTool` and checks no checksum or signature; with no `terraform_version` it takes the latest release.
- `actions/setup-node` v7.1.0, read 2026-11-09: on a tool-cache miss it downloads the archive without a check.
- Runner image `ubuntu-24.04` 20261101, read 2026-11-09: default Node 22.23.4; tool cache 24.22.2 only.
- Terraform 1.17.1's `SHA256SUMS`, verified 2026-11-09 with gpg: good signature by subkey `374EC75B485913604A831CC7C820C6D5CD27AB87` of HashiCorp's key `C874 011F 0AB4 0511 0D02 1055 3436 5D94 72D7 468F`, the fingerprint hashicorp.com/security publishes.
- Node 24.22.2's `SHASUMS256.txt.asc`, verified 2026-11-09 against the eight active release keys the nodejs/node README lists, taken from nodejs/release-keys: good signature by `5BE8A3F6C8A5C01D106C0AD820B1A390B168D356`.
- The branch's sandbox apply job, PR-274, 2026-11-09: `node-v24.22.2-linux-x64.tar.xz: OK`, `v24.22.2`, `terraform_1.17.1_linux_amd64.zip: OK`, `Terraform v1.17.1`.

## Where it is described

`.github/actions/node/action.yml`; `.github/actions/terraform/action.yml`; `docs/process/best-practices.md`, rule 14; `docs/standards/typescript.md`, rule 1; `docs/standards/terraform.md`, rule 13; `docs/runbooks/checkup.md`, rule 12, which checks the pins against the latest releases.
