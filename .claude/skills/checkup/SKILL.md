---
name: checkup
description: Review the whole HEAT tree on main against the written standards at a pause, from a session of its own, and file the findings in batches, one batch issue per pull request that would fix them, each finding a sub-issue labeled finding. Takes no argument for the whole tree, or one area name from the runbook's table (Packages, Client, Hub, Terraform, Pipeline, Documents, Art). Reads every finding issue and every open batch first so nothing open or excused is filed twice, cites one numbered rule per finding, caps the run in batches, and reports to the owner the candidate rules that pass the runbook's test. Use when asked to run the checkup, or when a session is started for it after a checkpoint merged or a step of the build order begun.
---

# Run the checkup

Follow `docs/runbooks/checkup.md`, step by step, on `main`: it holds the rules, the table of areas with their paths and documents, how findings are deduplicated, batched, capped and filed, what earns a rule, and the brief this session works from. Decision 0034 is why a finding is an issue and decision 0033 why the checkup runs in a session and not in CI. What this file adds is only how Claude Code's arguments and tools map onto the runbook:

- `$ARGUMENTS` is empty for the whole tree, or one area name from the runbook's table (rule 1). This session must have no issue in flight; if it does, stop and say so.
- A pass of the runbook's rule 4 is a subagent, the Agent tool with the `general-purpose` type, given the pass's brief; the passes run in one message so they run beside each other. The subagent's report is a claim: read the cited lines yourself before filing (rule 8).
- The issue bodies are written with the Write tool to the scratchpad and passed with `--body-file`, because a body on the command line loses its backslashes.
