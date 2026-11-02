# Project documents

Everything a person or an agent needs in order to understand HEAT and work on it. `AGENTS.md` at the repository root is the entry point. This file is the index, and it says how the documents are written and loaded.

## Index

| Document | Covers | Reaches an agent |
| --- | --- | --- |
| [../README.md](../README.md) | The front page for a person arriving at the repository: what HEAT is, where it runs, what it shows, the system and the adventure loop as diagrams, how it is built, a reviewer's fifteen-minute path, where to read next | Never by itself; a person's entry point, where `AGENTS.md` is an agent's |
| [process/collaboration.md](process/collaboration.md) | How the project owner and an agent work together | Every session |
| [process/code-changes.md](process/code-changes.md) | Checkpoints, branches, pull requests, review, merging, who applies | Every session |
| [process/best-practices.md](process/best-practices.md) | Best practice first, especially for security and platform management; the page is responsive; a decision is challenged when wrong; a document gap is closed where it is found | Every session |
| [process/assets.md](process/assets.md) | Generated art and audio: the services, the connectors, the hero sprite set, a camp's ground and facilities, the page's icons, monsters and props, the provenance beside each set | When the agent reads it |
| [runbooks/hero-sprite-set.md](runbooks/hero-sprite-set.md) | Making a hero or monster sprite set: the order of work, the script that writes and checks the files and the provenance; the skill `.claude/skills/hero-sprite-set/` points at it | When the agent makes art |
| [runbooks/review-change.md](runbooks/review-change.md) | Reviewing a pull request against the standards from a session that did not write it: the range from the pull request, the documents by the paths touched, one numbered rule per finding, findings as review threads, candidate rules, the built-in code review; the skill `.claude/skills/review-change/` points at it | When a session is started to review a pull request, from `code-changes.md` rule 23 |
| [runbooks/checkup.md](runbooks/checkup.md) | Reviewing the whole tree on `main` against the standards at a pause, from a session of its own: one pass per area under its documents, the documents' sweep and the drift questions, one numbered rule per finding, findings deduplicated against the `finding` issues and filed as issues under a cap, candidate rules to the owner; the skill `.claude/skills/checkup/` points at it | When a session is started for the checkup, from `code-changes.md` rule 28 |
| [process/development.md](process/development.md) | Running and seeing a change: the branch's sandbox stack, the fast loop on the laptop, logs, the cap | When the agent reads it |
| [process/deployment.md](process/deployment.md) | How a change reaches each environment and how a release is made: the release pull request, the guard, the tag, hotfixes, the first release | When a release is made, from `code-changes.md` rule 18 |
| [design/purpose.md](design/purpose.md) | Why the project exists and what it concentrates on | When the agent reads it |
| [design/game.md](design/game.md) | The game: what the player does | When the agent reads it |
| [architecture/overview.md](architecture/overview.md) | The system: three diagrams, then services, data, flows, build order | When the agent reads it |
| [decisions/](decisions/README.md) | One record per significant decision, including what was rejected | When the agent reads it |
| [../terraform/backend/README.md](../terraform/backend/README.md) | The state bucket, who applies it, and the one-time bootstrap | When the agent reads it |
| [../terraform/bootstrap/README.md](../terraform/bootstrap/README.md) | The pipeline's plan and apply roles, their boundary and the budget action in each workload account, who applies, what waits on what | When the agent reads it |
| [../terraform/environment/sandbox-base/README.md](../terraform/environment/sandbox-base/README.md) | The sandbox base: the zone, the shared user pool and its CI client, the test users, and how the pipeline plans and applies a permanent root | When the agent reads it |
| [../terraform/environment/sandbox/README.md](../terraform/environment/sandbox/README.md) | The per-issue sandbox stacks: the one root, the environment module, the workflow, the cap and the sweep | When the agent reads it |
| [../terraform/environment/dev/README.md](../terraform/environment/dev/README.md) | The dev environment: one root for the base, the environment and the login domain, applied on every merge to `main` with its smoke test; the first apply and the delegation | When the agent reads it |
| [../terraform/environment/prod/README.md](../terraform/environment/prod/README.md) | The prod environment: the same root shape without a password-flow client or test users, applied on every merge to `release` through the release pull request, the guard, the token-free smoke test, the tag and the Release; the first release and the delegation | When the agent reads it |
| [standards/typescript.md](standards/typescript.md) | Versions, dependencies, modules, testing, the hub's libraries, bundling, the client's versions and build, lint, a known library over our own | When the agent works under `packages/`, through that directory's `AGENTS.md` |
| [standards/angular.md](standards/angular.md) | How the client is written: components, signals and injection, where the data lives, pages and panels, the PixiJS boundary, templates, accessibility, tests, styles and their tokens | When the agent works under `packages/client/`, through that directory's `AGENTS.md` |
| [standards/graphql.md](standards/graphql.md) | How the API and the hub are written: the schema's shape, resolvers, authorization, input, errors, logging, the data layer, tests | When the agent works under `packages/hub/`, through that directory's `AGENTS.md` |
| [standards/terraform.md](standards/terraform.md) | How a stack is written: roots and modules, what never enters git, naming and tags, the guardrails, versions and state, comments, the Terraform floor, when a change needs a decision record | When the agent works under `terraform/`, through that directory's `AGENTS.md` |

## Planned

These are part of the structure and are not written yet. Each is written when there is a decision to put in it.

| Document | Written when |
| --- | --- |
| `standards/<area>.md` | The first code in that language or area lands; `typescript.md`, `angular.md`, `graphql.md` and `terraform.md` exist |
| More of `runbooks/` | A multi-step procedure will run more than once and an agent must follow it without the conversation that shaped it; `runbooks/hero-sprite-set.md`, `runbooks/review-change.md` and `runbooks/checkup.md` exist |

## How documents are written

1. **Write for an agent first.** Be explicit and concrete, and assume no background. A person can read a document written that way. An agent cannot reliably work from one written for a person who already knows the project.
2. **Rules first, reasons after.** A document opens with short rules that can be checked. The reasons follow in their own section.
3. **One topic per file,** under about 200 lines. Longer files are followed less reliably.
4. **Write a document when there is a decision to record,** not before. Do not write down what an agent would do anyway, or what it can read from the code.
5. **Keep documents true.** A change in behavior and the document that describes it go in the same pull request.
6. **Say what is real.** Nothing is described as built, tested or enforced unless it is.
7. **Mark the status of design items.** Each item in a design or architecture document is labeled Decided, Working assumption or Open. The labels are defined at the top of each of those documents.
8. **Design and process documents say what is true now.** When a decision changes, edit the document and add a decision record. The record keeps what was rejected and the history; in the document, how a rule got there is one sentence pointing at the record. At the pauses that rule 9 of `process/best-practices.md` names, a checkpoint merged or a step of the build order begun, the documents are swept for history that has crept in, and it is moved to a record or cut.
9. **AWS account ids do not appear in committed files.** Documents and code name accounts by name (`heat-dev`, `heat-platform`) and never by id. Credentials never appear anywhere. This repository is written to be safe to publish; the organization-level `dcg-platform` repository takes the opposite rule, for reasons recorded there as its decision 0001. The ids reach the pipeline as repository secrets, `HEAT_<ENVIRONMENT>_ACCOUNT_ID`, never as variables, because GitHub masks a secret in every log line and the logs are public with the repository (decision 0035).
10. **A procedure lives in one document.** Another document that needs it names it and points at it; it does not restate the steps. A process rule says that the procedure is followed and where it is; a decision record says why it has the shape it has; a skill says how Claude Code's arguments map onto it. From the review skill's first run (decision 0033).
11. **Rule numbers are stable.** A new rule is appended to its document, never inserted; a retired rule keeps its number and says it is retired, with the record that retired it. A finding, a review thread, an issue and another document cite a rule by its number, and the checkup's deduplication keys on it (`runbooks/checkup.md`, rule 7), so a renumbering would break every citation. From the review of PR-163 (Issue-147).
 12. **An image under `docs/` says what it shows and when.** Its alt text, or a note beside the file, names the stack or commit it was captured from, or the committed art it was composed from, as every set under `art/` carries its provenance. From the review of PR-179 (Issue-177).

## Not documents

`docs/private/` is ignored by git and holds working notes: account ids, inventories, runbooks in progress, and the hand-over notes from the `dcg-platform` repository. Nothing there is reviewed or kept true. Where a committed document and a private note disagree, the committed document wins, and the AWS APIs win over both. One file there, `heat-working-context.md`, is read at the start of every session (`AGENTS.md`, "Starting on an issue"): it carries the account ids, the standing rules summarized for a session without the repository, and the state of the work, which the agent updates as it goes.

## Where documents live

Content that a person or another tool might need lives under `docs/`, in plain Markdown. Nothing of that kind lives under `.claude/`, which holds only what is specific to Claude Code: `settings.json`, and skills that point at files in `docs/runbooks/`. A skill holds its frontmatter and how Claude Code's arguments map onto the runbook it points at, and nothing the runbook already says (rule 10).

## How agents load these documents

- `AGENTS.md` is the entry point. It imports the documents that every session needs, using `@path` references.
- Each area of the repository will have its own `AGENTS.md` that imports the standards for that area. Those load only when an agent works on a file in that area.
- Beside every `AGENTS.md` there is a `CLAUDE.md` containing only `@AGENTS.md`.

The last rule has no exceptions. Claude Code reads `AGENTS.md` by itself only when no `CLAUDE.md` exists at or above the working directory, so one `CLAUDE.md` without a partner in another directory silently switches that directory's `AGENTS.md` off. Pairing them everywhere avoids that, and it also covers sessions that look for `CLAUDE.md` by name.

Two more things were found by testing with Claude Code 2.1.295:

- An import inside a path-scoped rule under `.claude/rules/` loads at session start, which defeats the scoping. That is why area standards are loaded through per-area `AGENTS.md` files and not through rules.
- `@path` expansion is a Claude Code feature. Other tools follow the nested `AGENTS.md` convention but may treat an import as a plain file reference, so each import is written as an instruction: "Read and follow ...".
