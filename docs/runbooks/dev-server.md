# Running the dev server from an issue's worktree

How the Angular dev server is run for display work, from the issue's worktree, in a session of the Claude desktop app. `docs/process/code-changes.md`, rule 24, says when it runs, that there is one at a time, what a busy port means and that the owner can see and stop it; `docs/process/development.md`, rule 5, says what it serves and how an agent signs in. This runbook is the order of work and what goes wrong. The Claude Code skill `.claude/skills/dev-server/` points here.

## Rules

1. **The port is checked first.** `netstat -ano | grep :4200` in the Bash tool, or `Get-NetTCPConnection -LocalPort 4200` in PowerShell. What a listener means, and what the session then does, is `docs/process/code-changes.md`, rule 24.
2. **The worktree is made ready first.** In a fresh worktree, `npm ci`, then `npm run build --workspace @heat/engine` (`docs/process/development.md`, rule 10).
3. **It runs in a terminal tab the owner can see, from the worktree.** `npm start --workspace @heat/client`, with the worktree as the tab's directory and a title that names the issue. The app's own preview server is not used: it is anchored to the directory the session started in, which is the checkout on `main`, and would serve `main`.
4. **The page is `http://localhost:4200` in the session's browser,** signed in as a test user (`docs/process/development.md`, rule 5). The stack's sign-in carries over from the stack's own URL, so there is usually no second sign-in.
5. **Restart it after the gate.** `npm test` and `npm run build` in the same worktree re-run `packages/client/scripts/copy-art.mjs`, which deletes and copies `generated/art` again; the running server then answers 404 for every file under `/art/`, with no sprites and broken icons, until it is restarted. Run the gate before starting the server, or restart after it.
6. **Clear the cache after an engine change.** The dev server bundles `@heat/engine` ahead of time into `packages/client/.angular/cache` and does not refresh it when `packages/engine/dist` is rebuilt, not even on a restart. After any change to the engine: stop the server, delete `packages/client/.angular/cache`, start it again, and search the cached `@heat_engine.js` for the change to confirm.
7. **The session is on screen while the page is judged** (`docs/process/sessions.md`, rule 13).
8. **Prop art is judged at the stack's URL.** After an ore vein's art was made again, the dev server drew no vein, though the files were served byte for byte and the stack's production build drew it at once. Not diagnosed, and left so by the owner's call (2026-10-23, Issue-133).
9. **Stop it before the reset.** The tab is stopped before the worktree is removed (`docs/process/code-changes.md`, rule 26), and the shell leaves the worktree first (`docs/process/sessions.md`, rule 9).

## Why

The rules of when and how many are in `docs/process/code-changes.md`, because they are about two sessions and one owner. What is here is what a session learned by getting it wrong: the preview server that served `main` (Issue-45, Issue-46), an afternoon of missing sprites that were a deleted directory (Issue-15), and an engine fix that was not in the page because the cache held the old bundle (Issue-15).
