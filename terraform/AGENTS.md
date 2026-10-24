# terraform

The stacks: `backend`, `bootstrap` and `environment`, one root per environment, with the resources in `modules/`. Each stack's README says what it manages and whether it is applied; the pipeline applies everything but `bootstrap`, which the owner does (`docs/process/code-changes.md`, rule 18).

Read and follow the standards for this area: @../docs/standards/terraform.md
