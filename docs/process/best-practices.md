# Best practices first

How decisions are made, especially about security and platform management. These rules apply in every session.

"Security and platform management" covers: accounts and organization structure; identity and access for people, pipelines and services; credentials and secrets; network exposure; data protection; logging and audit; Terraform state; build, release and deployment controls; cost controls.

## Rules

1. **Follow established best practice.** In security and platform management it is not traded for speed.
2. **Propose the recommended approach first.** When the provider or a recognized standard recommends a way of doing something, that is the default proposal. A quicker alternative may be offered beside it, labeled as a shortcut, with what it gives up.
3. **Check, do not recall.** Before proposing a setup in these areas, look up the current guidance, say what it is, and say where it came from. Console steps are verified against documentation, not recalled.
4. **Never skip a step silently.** A step that is deferred is written down as deferred, with the reason and what it leaves exposed.
5. **Scale down only on purpose.** Where the full practice is out of proportion for this project, say what the full practice is, what is proposed instead, and why. The project owner decides, and the decision gets a record in `docs/decisions/`.
6. **Do not hurry these decisions.** A decision in these areas is talked through before it is implemented, even when that slows a checkpoint.
7. **Import, do not recreate.** Something that already exists in AWS and is to be managed by code is imported into state. Recreating it is a change to a working estate and is proposed only with the reason.
8. **Control Tower's own resources are never touched by code.** The service control policies, stack sets, roles, buckets and trails that Control Tower creates in HEAT's accounts belong to it. HEAT's stacks build beside them. The organization-level reasoning is decision 0002 in the `dcg-platform` repository.

## Why

Hasty decisions and skipped steps in security and platform management always end up being regretted. Identity, account structure and release controls are foundations: everything else is built on them, they are far harder to change afterwards than to set up correctly, and their failures tend to stay quiet until they are serious.

The rule to propose the recommended approach first comes from a real miss. The first plan for command-line access to the project's AWS accounts reused a long-lived access key on a user in the organization's management account, because that matched an existing setup. The recommended practice is single sign-on with short-lived credentials. The project owner caught it. The shortcut should never have been the first thing proposed.

The sentence added to rule 3 on 2026-10-13, and rules 7 and 8, come from the organization-level work in the `dcg-platform` repository. Console descriptions given from memory were wrong more than once during the AWS review; descriptions checked against the documentation were not. Rules 7 and 8 describe how every stack in the organization treats what already exists, and HEAT's accounts are Control Tower accounts, so they apply here as they do there.
