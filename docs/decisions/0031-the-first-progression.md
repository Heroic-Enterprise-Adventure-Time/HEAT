# 0031: The first progression: a first job a villager cannot fail, and one run per step

- **Status:** Decided; the numbers are working assumptions in the engine's static content. The gather jobs' hauls, the timber job's trees and the table's rows for them are replaced by 0051 (Issue-283, 2026-11-10); the costs and the one run per step stand.
- **Date:** 2026-10-22
- **Settles:** Issue-126: the first job a new player can take, and the costs from there to a fighter, which Issue-82 (paid recruitment), Issue-93 (building facilities) and Issue-133 (the mine's first job) build to.

## Decision

**The first job.** "Pick up sticks", first on Millbrook's board: travel, fell one tree, arrive. No monster, so a lone villager cannot be hurt. It carries 40 timber, the whole tree, so the stage ends when the tree falls; it has no pay and gives 5 XP. Its gather stage keeps a time limit, 60 s, as decision 0030 requires of every gather stage. The slowest a player can make it, by forcing the villager to swing at the tree every turn, ends its gather in about 31 s with 20 timber.

**One run per step.** Each step of the progression is paid for by one run of the job before it:

| Step | Paid by | Cost |
| --- | --- | --- |
| A second villager | one run of "Pick up sticks", 40 timber | 20 timber |
| The mine, level 1 | one run of "Timber from the near woods", 60 timber and 3 cloth | 60 timber and 3 cloth |
| A fighter | one run of the mine's first job, 40 ore | 40 ore |

With a fighter beside a villager, "Wolves on the mill road" is safe. The board lists its jobs easiest first: sticks, timber, wolves. The wolves job is unchanged.

**Building is instant.** Nothing in the game gates on real time (game.md, "The adventure loop").

**The board says what a job brings home.** The list showed only the pay, which for the first job would read "no pay"; it now shows the pay and the cargo, as the job's detail already did.

**Checked with the engine** (`replay`, 1,000 seeds per party, no overrides unless said):

| Job | Party | Outcome | Deaths per run | Brings home |
| --- | --- | --- | --- | --- |
| Pick up sticks | 1 villager | complete 1,000 | 0 | 40 timber |
| Pick up sticks | 1 villager, forced to swing every turn | complete 1,000 | 0 | 20 timber |
| Timber from the near woods | 1, 2 or 3 villagers | complete 1,000 | 0 | 60 timber, 3 cloth |
| Ore from the hill (Issue-133) | 1 or 2 villagers; fighter + villager | complete 1,000 | 0 | 40 ore |
| Wolves on the mill road | 1 villager | defeat 1,000 | 1.00 | nothing |
| Wolves on the mill road | 2 villagers | complete 931, defeat 69 | 0.48 | 10 cloth when complete |
| Wolves on the mill road | 3 villagers | complete 1,000 | 0 | 10 cloth |
| Wolves on the mill road | fighter alone | complete 505, defeat 495 | 0.49 | 10 cloth when complete |
| Wolves on the mill road | fighter + villager | complete 1,000 | 0 | 10 cloth |

The engine's test replays the sticks job with a lone villager over 500 seeds, without overrides and forced to swing every turn.

## Considered and not chosen

**No time limit on the first job,** or one too long to matter. Decision 0030 makes every gather stage carry one as a deadlock kill switch, and a job with none would be the one place a stall could hang a run. A limit about twice the worst case costs nothing.

**Carrying 20, half the tree.** It would match a villager's cost exactly, but the tree would stay standing and the stage would end on the load, not on felling the one tree the job is about.

**The villager at 5 timber,** the earlier working assumption. One sticks run would have filled the hall; the step would not be a step.

**A fighter paid in iron,** as first said. There is no iron yet: the materials are timber, ore and cloth, and iron would need a smelter. Ore from the mine is the fighter's material for now.

**The fighter at 10 ore and 5 cloth,** the earlier working assumption. Cloth comes mostly from the wolves job, which a fighter is what makes safe, so the cost would have been circular.

**The mine's first job in this issue,** as content kept off the board until Issue-93. The owner kept it as its own issue, Issue-133, after the mine exists: the job means nothing until the mine that posts it can be built.

**Changing the wolves job** so that a lone villager survives it. It is the job a fighter makes safe; a villager lost on it is replaced for nothing by the free-villager rule, so no player is locked out.

## Where it is described

`docs/design/game.md`, "The battle", "The heroes hall" and "Resources". The numbers are in `packages/engine/src/content.ts`. Issue-82, Issue-93 and Issue-133 carry the numbers each builds to.
