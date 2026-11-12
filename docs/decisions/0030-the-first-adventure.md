# 0030: The first adventure: the engine, the marching order, stage time limits, and one version per deploy

- **Status:** Decided. Amended by Issue-115 on 2026-10-22, the owner's call: an outdated client reloads itself rather than prompting a refresh, at once with no adventure open and otherwise once the adventure is over, and a tab reloads away from a version only once. Amended by Issue-15 on 2026-10-22, the owner's call: a stage's time limit is shown as a countdown in whole seconds in its last ten seconds of simulated time. Amended by 0051 on 2026-11-10 (Issue-283): a fight or a gather lists nodes and monsters together and ends when all of them are down, and a stored timeline of another schema version is "replay unavailable", never migrated.
- **Date:** 2026-10-21
- **Settles:** Issue-109: the shape that Issue-110 to Issue-115 and Issue-15 build, agreed in the planning session of 2026-10-21.

## Decision

**The battle engine.** The turn machinery is adapted from BattleScript Online's combat engine: the engine the caller steps to the next event, the seeded random number generator, charge timers, abilities with tags and reach by line, the event timeline, and overrides stamped in simulated time, with the tests that prove them. Left behind: player-authored behavior sets, status effects, mana and resource pools, traits, equipment, skill trees, quests, presentation cues, and the grid's rows. Each unit type has one fixed action list, the first usable action wins, and a better unit type is a better list.

**A marching order.** Each side has four lines, front, near, far and back; a line holds any number of units with no order within it; a unit type has a home line. Reach is by line. When a side's front line empties, every unit on that side moves up a line, so the nearest occupied line is always the front. Stepping up is also an action for the unit types whose list says so, the villager and the monsters among the first; the fighter holds its line.

**Stages and time limits.** A job is an ordered list of stages on one timeline with health and cargo carried over. Every fight and gather stage carries its own time limit, because some are expected to resolve faster than others; reaching it ends the adventure as a retreat with the job's penalty. It is a deadlock kill switch, never a mechanic to play against, shown only in its last ten seconds, as a countdown (amended by Issue-15).

**One version for the whole app.** The client, the hub and the engine carry one version, the commit the workflow deployed. An adventure is stamped with it at start and is verified only by that version. Every deploy republishes the hub and moves its `live` alias; a second alias, `previous`, keeps the deploy before, reachable at a second route behind the same authorizer, so an adventure started under the previous deploy is verified by it. The current route refuses another version with `ENGINE_UPDATED`; the client tries the previous route; the same refusal there means too old, and the client asks for the discard. The client sends its version on every request and is told when it is outdated, and defers the refresh prompt while an adventure is in progress. The snapshot therefore holds only the party's effective numbers and the job by id; the content is read by the version that verifies. Determinism is a property within one version, which the engine's test proves by stepping the same run two ways.

**Replays and resume.** A replay is the timeline the hub wrote at settlement, display only, played by any client without the engine. Resuming replays the override log so far with the client's own engine, whatever version issued the adventure; the issuing version's verification is the result.

**Settlement.** XP to each surviving hero with its level from a threshold table, no stat-boost picks yet; credits capped at the warehouse with the loss recorded; a hero at zero health at the end is dead, with its status, the camp's living count and its sighting changed in the one transaction; survivors' sightings refreshed.

## Considered and not chosen

**A grid with rows**, as BattleScript Online has. Rows add arithmetic the side-on view cannot show; lines are readable from the sprites.

**Units that move one at a time and never collapse.** When the fighter falls, the wolves would stand in an empty front line and the villagers behind would be out of everyone's reach. Collapse makes reach mean "the nearest occupied line" without a special case.

**A villager that holds when it cannot reach.** The owner wants villagers walking up and swinging: they are not tactical units, and a player is not meant to keep them.

**Player-authored behavior sets.** The design says every unit type has one way of choosing its actions, and progression is gaining unit types that need less intervention. A swappable behavior set has no place in that.

**One continuous track with positions** instead of discrete stages. A later refinement; the hub and the client need one timeline with stages now.

**A time cap that ends a fight as a draw.** A draw has no meaning in a job; a forced retreat does, and the penalty is the job's own.

**An engine logic version, bumped by hand, with the previous engine's source kept as a frozen copy in the repository.** The copy would be the previous merge, which is `dev`'s previous and never `prod`'s: `dev` may take ten bumps while `prod` takes one. A previous version has to be per environment, and the pipeline already keeps it as the Lambda version before the current.

**A compatibility shim per logic change**, kept for one release. Judgment per change, and the same per-environment problem.

**Content frozen in the snapshot** so that content changes never invalidate an adventure. With one version per deploy the verifying engine always has the content that issued the snapshot, so the freeze buys nothing.

**Rotating `previous` only when the engine changes**, keyed on an engine version file. One version for everything is simpler, the outdated-client check needs it anyway, and what it costs is an adventure in flight across two deploys of the same environment: two `prod` releases within an hour, which means something else has gone wrong.

**Finishing a resumed adventure on the server under the old version** when the client's engine is newer. Unnecessary: the client resumes with its own engine for display, and the issuing version verifies the submitted log either way.

**Reading replays from the bucket through CloudFront.** The hub is the one API and the one place authorization is answered (decision 0012); the bucket stays private. The lever if timelines grow.

**Retiring the previous version by time** rather than by the next deploy. A clock in the decision for no gain.

**A golden replay test**, a recorded run whose timeline a change must not alter, to make a change to determinism visible in review. Raised by the owner in review of PR-116: with every adventure fixed to the version that issued it, a change to the timeline between versions is just another change, and a replay makes no decisions, so there is nothing across versions to guard. Dropped.

## Where it is described

`docs/design/game.md`, "The adventure loop" and "The battle". `docs/architecture/adventure-loop.md` since Issue-282. `docs/architecture/overview.md`, "The adventure loop", "Camps, heroes and resources", "Environments" and "Engine provenance". Decision 0003 as amended.
