# 0054: The repository's npm scripts run in an issue's worktree without a prompt, through a committed hook that is a convenience and not a boundary

- **Status:** Decided; corrected on a fact by Issue-320, the decision standing. Four sentences below say that a prompt remains for what the hook does not answer: "which leaves the normal prompt in place", "Everything else still asks", "What the hook keeps is the prompt on everything that is not one of the repository's scripts" and "refusing the tools costs a prompt now and then". Each holds only in a session that prompts. What the hook does not answer goes through the session's normal permission flow, which in auto mode is the classifier, running or refusing the command without asking until repeated refusals bring the prompt back; that is now stated in `docs/process/code-changes.md`, "What enforces this". Two more sentences describe the prompt the hook removes: "it costs a click before every gate of every issue" and "No loosening: a prompt every time". In auto mode there is no click to save: with no hook, the classifier would decide those commands. Whether the hook's "allow" there also answers ahead of the classifier is not established: Claude Code's documentation says an "allow" skips the permission prompt, and does not say of a shell command that it skips the classifier
- **Date:** 2026-11-17
- **Settles:** Issue-318: whether an agent may run the repository's own npm scripts without asking, and where that permission is written. It had been the owner's standing rule since 2026-10-23 (Issue-149), kept as a hook in one laptop's user-level settings. The review of PR-321, which moved the hook into the repository, found that it allowed more than its description said, and proposed that a loosening of an agent's permissions be a record.

## Decision

**In an issue's worktree, four npm commands run without a prompt.** `npm test`, `npm ci`, `npm start` and `npm run <script>`, with the workspace options (`--workspace`, `-w`, `--workspaces`, `--if-present`) and, after `--`, the script's own arguments; optionally piped into `tail`, `head`, `grep`, `wc`, `cut` or `tr`; and an `echo` used as a marker. `.claude/hooks/allow-npm-in-worktree.mjs` answers "allow" for those and prints nothing for anything else, which leaves the normal prompt in place. A worktree is `<checkout>-<issue>` beside the checkout or `<checkout>/.claude/worktrees/<name>`; the checkout on `main` is not one, and a terminal call that names no directory is not taken to be in one.

**Everything else still asks.** `npx`, which runs code the repository does not hold. Every other npm option, because `--script-shell`, `--prefix` and `--registry` change what runs or where it comes from. `sed`, `sort` and `uniq` as filters, because each can run a command or write a file. A second command on a new line, a redirection to a file, a command substitution.

**It is a convenience, not a boundary.** `npm test` runs whatever the branch holds, and the agent writes the branch. A prompt on `npm test` shows the command and not the code, so it protects nothing that a session could not reach by writing a test first; it costs a click before every gate of every issue. What the hook keeps is the prompt on everything that is not one of the repository's scripts.

**What bounds an agent is elsewhere.** Its AWS access is read only (`docs/process/code-changes.md`, rule 19). A push to `main` or `release`, a tag and a merge are denied in `.claude/settings.json`, and both branches take changes only through a pull request the owner reads and merges. The pipeline's roles, not the laptop, apply every environment (decision 0017).

**What it leaves exposed.** Code the agent wrote, and whatever `npm ci` runs for a dependency the lock file names, executes on a person's laptop with that person's rights before a person has seen it. It can read what that person can read, the private files and a signed-in read-only AWS profile among them. The lock file pins every dependency exactly and `npm ci` installs only what it records, which narrows the second half and not the first.

**The full practice is isolation, and it is deferred.** Running an agent's commands where the home directory is out of reach, in a container or in the tool's own sandbox, is what closes that exposure. It is not taken up here: it changes where a session works, which is the question of Issue-319, and it is weighed there.

**A hook that answers "allow" is tested, and a loosening is a record.** `.claude/hooks/*.test.mjs`, run by `npm test` and so by "Build and test", lists what each hook must allow and what it must refuse. `docs/process/best-practices.md`, rule 15, makes this record the pattern for the next loosening.

## Considered and not chosen

- **Allow rules in `.claude/settings.json`, `Bash(npm run:*)` and its like.** The plain mechanism, and the first proposal. A rule for `Bash` does not cover the terminal tab's tool, where the dev server starts, and a prefix rule allows every option that follows the prefix, `--script-shell` among them.
- **The hook left in user-level settings.** It reached one person, carried that person's home directory in its pattern, was read by no review and run by no test. The review found in an hour that a pipe into `sed` ran any command.
- **No loosening: a prompt every time.** The safest reading of the words, and no safer in fact, because the prompt cannot show what the script will run.
- **`sed`, `sort`, `uniq` and `cat` kept as filters.** `sed`'s `e` runs a command and its `w` and `-i` write; `sort -o` and `uniq`'s second operand write. Refusing their dangerous forms means parsing each tool's options; refusing the tools costs a prompt now and then.
- **A terminal call with no directory taken to be in the worktree.** The first shape, so that a tab used again needed no path. It allowed `npm ci` in any directory a tab had been opened in. A `cd` into the worktree at the head of the command does the same job and is checked.
- **A library to split the command.** A hook runs before `npm ci`, in a checkout that may have no `node_modules`, so it can import only Node's own modules (`docs/standards/typescript.md`, rule 17). The splitter refuses what it cannot read, a pipe inside quotes for one.

## Where it is described

`.claude/hooks/allow-npm-in-worktree.mjs` and its test beside it; `.claude/settings.json`; `docs/process/code-changes.md`, "What enforces this"; `docs/process/best-practices.md`, rule 15; `docs/process/sessions.md`, rule 9.
