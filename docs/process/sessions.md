# Sessions

What an agent's session has to know about the machine and the tools it runs in, which no reading of the code would tell it. Written from sessions on the owner's laptop, Windows 11 with the Claude desktop app; a session on another system keeps what applies. The procedures are runbooks: the dev server is `docs/runbooks/dev-server.md`, and a picture of the scene is `docs/runbooks/capture-scene.md`. What the local checks and a stack do is `docs/process/development.md`.

## Rules

### The shells

1. **Two shells, never mixed.** The agent's Bash tool is Git Bash. Anything handed to the owner is PowerShell (`docs/process/collaboration.md`).
2. **No `cd <path> && ...` in the Bash tool.** The shell profile's `fnm` hook, tripped by `.node-version`, can end the chain after the `cd`, printing only "We can't find the necessary environment variables to replace the Node version"; later lines still run, so a push can go out with no commit behind it. Use `builtin cd <absolute path> && ...`, `git -C <path>`, `terraform -chdir=<path>` and absolute file paths, and read `git log --oneline -1` before a push. The working directory is reset after every call.
3. **Anything with a backslash, an apostrophe or a backtick goes through a file.** The Bash tool loses them on a command line and in a heredoc. A script, a JSON body, an issue's or a pull request's body is written to the scratchpad with the Write tool and run or passed by path (`node <path>`, `--body-file <path>`). A heredoc carries plain prose only, and a `python` heredoc hangs.
4. **Git Bash rewrites an argument that starts with `/` into a Windows path.** Set `MSYS_NO_PATHCONV=1` for an `aws` command that names `/aws/...` or `/heat/...`.
5. **PowerShell, when the agent runs it,** is `powershell -NoProfile -File <script.ps1> -Name value`. The terminal tab refuses a computed command line, one with variables or pipes, so that goes into a `.ps1` too. `-flag=$var` passes the text `$var`: write the value out. `Out-File -Encoding utf8` writes a byte-order mark, which `JSON.parse` refuses. `-File` passes an array as one string: join with commas and split inside. With `$ErrorActionPreference = "Stop"`, `2>&1` turns `npm ci`'s first warning into a terminating error.
6. **`gh` and `git`.** `gh api -F body=@<file>` reads the file; `-f` sends the text `@<file>`. `gh run view --log` can time out; `--job <id> --log` into a file works. `gh variable set` takes `--body`, not a pipe. `git branch -vv` prints `[origin/x: gone]`, so match `: gone]`.

### The laptop's tools

7. **A tool installed by winget is not on a session's PATH.** actionlint, trivy and tflint (`docs/process/development.md`, rule 2) are each under `%LOCALAPPDATA%\Microsoft\WinGet\Packages\<package id>_Microsoft.Winget.Source_8wekyb3d8bbwe\`; the executable is called by that path, actionlint from the worktree's root with no argument, trivy as `config .` from the worktree's `terraform/`, where `-q` quiets it and `--format json` gives one entry per finding.
8. **What is not installed is not assumed.** No `jq`: `gh`'s `--jq`, or Node. No Pillow: image work is in Node, or in PowerShell with `System.Drawing`; Python's `write_text` writes CRLF, which is stripped before a commit. A tool the work needs and the machine lacks is asked for (`docs/process/collaboration.md`).

### The desktop app

9. **The session starts in the checkout on `main` and reaches the issue's worktree by absolute path.** It does not enter the worktree, because a session isolated in one cannot write the checkout's git-ignored files. Asking the app for the worktree as a working directory brings a trust prompt; for an issue's worktree of this repository the owner's standing answer is yes, and the agent does not ask first. That request moves the shell into the worktree, so the shell leaves (`builtin cd` to the checkout) before `git worktree remove`. Where the removal is still refused, the agent unregisters the worktree, prunes, deletes the local branch, and hands the owner one `Remove-Item -Recurse -Force <folder>`. Whether the worktree should live elsewhere is Issue-319.
10. **Hooks and a subagent's definition are read when the session starts, from the directory it started in.** That is the checkout on `main`, so a hook changed on a branch, or a subagent defined on one, is first run by a session started after the merge. A step that needed one is reported as not run; another agent type is never substituted for it (decision 0033).
11. **The answer is the last thing in the turn.** The app may condense text written before a tool call. When a turn owes the owner content, the turn's wrap-up carries the recap alone and the content follows it as the closing message, with any question in its prose; a wrap-up that carries a question ends the turn, so nothing can follow it. A recap never says "below" or "follows": `.claude/hooks/wrap-up-no-promises.mjs` refuses one that does, as a backstop to this rule.
12. **Cards, other sessions and run monitors.** The app refuses to start a session on a turn that an event, not the owner, started. A card cannot name another folder, so a session in another repository needs the owner's own words. A card another session proposed is dismissed only by that session. A run monitor can miss a run's end: the run is read before anything is said about it.
13. **A page in the session's browser draws no frames while the session is not on screen.** `requestAnimationFrame` does not fire in a hidden pane, so a battle does not advance and a canvas cannot be captured; a form can still be filled, and a click may need a second try. Display work is checked with the session in a window.

### What git does not carry

14. **Local memory holds only what is personal or true of one machine.** What another person's session would need is written into a document (`docs/README.md`, rule 14).
15. **Each machine brings its own.** None of this is in git, and a session that finds one missing asks for it:
    - **The private files** under `docs/private/` of the checkout on `main`: `heat-working-context.md` (the identifiers, how the agent reaches AWS, the owner's own context), `heat-tfvars.ps1` (sets `TF_VAR_*` for a terminal; read only with the Read tool and never printed), `heat-sandbox-test-users.env` (`docs/process/development.md`, rule 5) and `heat-browser-trace-key.pem` (`scripts/seal-browser-trace.sh`).
    - **The AWS profiles,** all read only: `audit-heat-<environment>` and `plan-heat-<environment>` (`docs/process/code-changes.md`, rule 19). Their sign-in expires within a day, and has expired between a release's plan and the read-back after its apply: the agent asks the owner to sign in again before the merge, not after.
    - **The tools:** Node through `fnm` at the version `.node-version` names, Docker Desktop running for `npm test`, Terraform, and the winget tools of rule 7 at the releases the workflows pin.
    - **The user-level Claude settings.** Allow rules to read and edit the worktrees beside the checkout, whose paths cannot be written relative to the project (Issue-319). The auto-mode classifier's description of the environment, which Claude Code reads only from user-level settings: the organization and the repository, that the repository is public, the protected branches, the `prod` roots as protected, and the project's own hosts as trusted. The PixelLab connector (`docs/process/assets.md`, rule 2), with an allow rule for its `get_balance` that names the connector's id and so changes when the connector is added again.

## Why

Every rule here is a failure a session met, and most looked like success in the transcript. The `cd` chain is the clearest: on 2026-10-15 (Issue-18) and 2026-10-18 (Issue-41) a command read correctly and did nothing after its first word, because the hook and the escaping both act before bash sees the line. The same holds for the heredoc that lost its backslashes (Issue-186) and the path Git Bash rewrote.

Rule 11 is here because a note was not enough. Twice on 2026-10-17 a recap said that a checklist was "below", and the box ended the turn with nothing below it; the practice went into `docs/process/collaboration.md`, and the hook is there because at the moment of the call the tool's own instructions outweighed a loaded note.

These rules were kept in one person's local memory and in a private file until Issue-318. Claude Code's memory is stored per machine and never reaches another person or a cloud session, so what was learned there was learned once per laptop. Rule 14 is the practice that came of it, and rule 15 names what stays outside git on purpose, so that a second machine is set up from a list and not from a failure.
