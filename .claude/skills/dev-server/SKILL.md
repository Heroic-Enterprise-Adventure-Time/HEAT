---
name: dev-server
description: Run HEAT's Angular dev server from the issue's worktree in a terminal tab the owner can see, and show the page in the session's browser at http://localhost:4200. Use when display work needs a loop of seconds, when asked to start, restart or stop the dev server, or when the page served locally shows no art or an old engine.
---

# The dev server

Follow `docs/runbooks/dev-server.md`, step by step. `docs/process/code-changes.md`, rule 24, and `docs/process/development.md`, rule 5, are the rules it works under. What this file adds is only how the desktop app's tools map onto the runbook:

- The worktree becomes a working directory of the session with `mcp__ccd_directory__request_directory`, called without asking first (`docs/process/sessions.md`, rule 9).
- The server is started with `mcp__terminal__run_in_terminal`, its `cwd` the worktree, and stopped with `mcp__terminal__stop_terminal_tab`. `mcp__Claude_Browser__preview_start` is not used: it serves the checkout on `main`.
- The page is opened with `mcp__Claude_Browser__navigate`.
- These tools are deferred: load them with one `ToolSearch` call before the first.
