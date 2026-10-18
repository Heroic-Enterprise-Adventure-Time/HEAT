# Project documents

Everything a person or an agent needs in order to understand HEAT and work on it. `AGENTS.md` at the repository root is the entry point. This file is the index, and it says how the documents are written and loaded.

## Index

| Document | Covers | Reaches an agent |
| --- | --- | --- |
| [process/collaboration.md](process/collaboration.md) | How the project owner and an agent work together | Every session |
| [process/code-changes.md](process/code-changes.md) | Checkpoints, branches, pull requests, review, merging, who applies | Every session |
| [process/best-practices.md](process/best-practices.md) | Best practice first, especially for security and platform management | Every session |
| [process/development.md](process/development.md) | Running and seeing a change: the branch's sandbox stack, the fast loop on the laptop, logs, the cap | When the agent reads it |
| [process/deployment.md](process/deployment.md) | How a change reaches each environment and how a release is made: the release pull request, the guard, the tag, hotfixes, the first release | When a release is made, from `code-changes.md` rule 18 |
| [design/purpose.md](design/purpose.md) | Why the project exists and what it concentrates on | When the agent reads it |
| [design/game.md](design/game.md) | The game: what the player does | When the agent reads it |
| [architecture/overview.md](architecture/overview.md) | The system: services, data, flows, build order | When the agent reads it |
| [decisions/](decisions/README.md) | One record per significant decision, including what was rejected | When the agent reads it |
| [../terraform/backend/README.md](../terraform/backend/README.md) | The state bucket, who applies it, and the one-time bootstrap | When the agent reads it |
| [../terraform/bootstrap/README.md](../terraform/bootstrap/README.md) | The pipeline's plan and apply roles, their boundary and the budget action in each workload account, who applies, what waits on what | When the agent reads it |
| [../terraform/environment/sandbox-base/README.md](../terraform/environment/sandbox-base/README.md) | The sandbox base: the zone, the shared user pool and its CI client, the test users, and how the pipeline plans and applies a permanent root | When the agent reads it |
| [../terraform/environment/sandbox/README.md](../terraform/environment/sandbox/README.md) | The per-issue sandbox stacks: the one root, the environment module, the workflow, the cap and the sweep | When the agent reads it |
| [../terraform/environment/dev/README.md](../terraform/environment/dev/README.md) | The dev environment: one root for the base, the environment and the login domain, applied on every merge to `main` with its smoke test; the first apply and the delegation | When the agent reads it |
| [../terraform/environment/prod/README.md](../terraform/environment/prod/README.md) | The prod environment: the same root shape without a password-flow client or test users, applied on every merge to `release` through the release pull request, the guard, the token-free smoke test, the tag and the Release; the first release and the delegation | When the agent reads it |
| [standards/typescript.md](standards/typescript.md) | Versions, dependencies, modules, testing, the hub's libraries, bundling, the client | When the agent works under `packages/`, through that directory's `AGENTS.md` |

## Planned

These are part of the structure and are not written yet. Each is written when there is a decision to put in it.

| Document | Written when |
| --- | --- |
| `standards/<language>.md` | The first code in that language lands; `standards/typescript.md` is the first |
| `runbooks/` | A multi-step procedure has been done more than once |

## How documents are written

1. **Write for an agent first.** Be explicit and concrete, and assume no background. A person can read a document written that way. An agent cannot reliably work from one written for a person who already knows the project.
2. **Rules first, reasons after.** A document opens with short rules that can be checked. The reasons follow in their own section.
3. **One topic per file,** under about 200 lines. Longer files are followed less reliably.
4. **Write a document when there is a decision to record,** not before. Do not write down what an agent would do anyway, or what it can read from the code.
5. **Keep documents true.** A change in behavior and the document that describes it go in the same pull request.
6. **Say what is real.** Nothing is described as built, tested or enforced unless it is.
7. **Mark the status of design items.** Each item in a design or architecture document is labeled Decided, Working assumption or Open. The labels are defined at the top of each of those documents.
8. **Design and process documents say what is true now.** When a decision changes, edit the document and add a decision record. The record keeps what was rejected and the history; in the document, how a rule got there is one sentence pointing at the record. At the pauses that rule 9 of `process/best-practices.md` names, a checkpoint merged or a step of the build order begun, the documents are swept for history that has crept in, and it is moved to a record or cut.
9. **AWS account ids do not appear in committed files.** Documents and code name accounts by name (`heat-dev`, `heat-platform`) and never by id. Credentials never appear anywhere. This repository is written to be safe to publish; the organization-level `dcg-platform` repository takes the opposite rule, for reasons recorded there as its decision 0001.

## Not documents

`docs/private/` is ignored by git and holds working notes: account ids, inventories, runbooks in progress, and the hand-over notes from the `dcg-platform` repository. Nothing there is reviewed or kept true. Where a committed document and a private note disagree, the committed document wins, and the AWS APIs win over both. One file there, `heat-working-context.md`, is read at the start of every session (`AGENTS.md`, "Starting on an issue"): it carries the account ids, the standing rules summarized for a session without the repository, and the state of the work, which the agent updates as it goes.

## Where documents live

Content that a person or another tool might need lives under `docs/`, in plain Markdown. Nothing of that kind lives under `.claude/`, which holds only what is specific to Claude Code: `settings.json`, and later skills that point at files in `docs/runbooks/`.

## How agents load these documents

- `AGENTS.md` is the entry point. It imports the documents that every session needs, using `@path` references.
- Each area of the repository will have its own `AGENTS.md` that imports the standards for that area. Those load only when an agent works on a file in that area.
- Beside every `AGENTS.md` there is a `CLAUDE.md` containing only `@AGENTS.md`.

The last rule has no exceptions. Claude Code reads `AGENTS.md` by itself only when no `CLAUDE.md` exists at or above the working directory, so one `CLAUDE.md` without a partner in another directory silently switches that directory's `AGENTS.md` off. Pairing them everywhere avoids that, and it also covers sessions that look for `CLAUDE.md` by name.

Two more things were found by testing with Claude Code 2.1.295:

- An import inside a path-scoped rule under `.claude/rules/` loads at session start, which defeats the scoping. That is why area standards are loaded through per-area `AGENTS.md` files and not through rules.
- `@path` expansion is a Claude Code feature. Other tools follow the nested `AGENTS.md` convention but may treat an import as a plain file reference, so each import is written as an instruction: "Read and follow ...".
