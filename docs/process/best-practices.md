# Best practices first

How decisions are made, especially about security and platform management. These rules apply in every session.

"Security and platform management" covers: accounts and organization structure; identity and access for people, pipelines and services; credentials and secrets; network exposure; data protection; logging and audit; Terraform state; build, release and deployment controls; cost controls.

## Rules

1. **Follow established best practice.** In security and platform management it is not traded for speed.
2. **Propose the recommended approach first.** When the provider or a recognized standard recommends a way of doing something, that is the default proposal. A quicker alternative may be offered beside it, labeled as a shortcut, with what it gives up.
3. **Check, do not recall.** Before proposing a setup in these areas, look up the current guidance, say what it is, and say where it came from.
4. **Never skip a step silently.** A step that is deferred is written down as deferred, with the reason and what it leaves exposed.
5. **Scale down only on purpose.** Where the full practice is out of proportion for this project, say what the full practice is, what is proposed instead, and why. The project owner decides, and the decision gets a record in `docs/decisions/`.
6. **Do not hurry these decisions.** A decision in these areas is talked through before it is implemented, even when that slows a checkpoint.

## Why

Hasty decisions and skipped steps in security and platform management always end up being regretted. Identity, account structure and release controls are foundations: everything else is built on them, they are far harder to change afterwards than to set up correctly, and their failures tend to stay quiet until they are serious.

The rule to propose the recommended approach first comes from a real miss. The first plan for command-line access to the project's AWS accounts reused a long-lived access key on a user in the organization's management account, because that matched an existing setup. The recommended practice is single sign-on with short-lived credentials. The project owner caught it. The shortcut should never have been the first thing proposed.
