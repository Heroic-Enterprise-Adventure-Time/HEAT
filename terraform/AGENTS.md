# terraform

The stacks: `backend`, `bootstrap` and `environment`, one root per environment, with the resources in `modules/`. Each stack's README says what it manages and whether it is applied; the pipeline applies everything but `bootstrap`, which the owner does (`docs/process/code-changes.md`, rule 18).

Read and follow the standards for this area: @../docs/standards/terraform.md

The detail of that standard's rules, the whole of those it writes as one line, what it holds back and why, is `docs/standards/terraform-detail.md`, which nothing loads; its opening says when each section is read.
