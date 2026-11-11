# Making a hero sprite set

How one hero sprite set is made with PixelLab, from an appearance and a class to committed files under `art/heroes/` with their provenance. A monster's set is made the same way, with the differences under "A monster" below. The rules are `docs/process/assets.md`, rules 5 to 13 and 28 to 29; this runbook is the order of work and the tooling, and does not repeat them. The Claude Code skill `.claude/skills/hero-sprite-set/` points here.

## Rules

1. **Inputs.** The class, for example `fighter`; its presentation, masculine, feminine or either, which the owner decides when the look is kept and which names a hero with the set may take (game.md, "Heroes"); the set's name, `<class>-<nn>`, numbered like the PixelLab character it comes from; and the appearance, the part of the description that changes (assets.md, rule 9), for example `fighter in a brown leather jerkin over chain mail, short dark hair`. Or a PixelLab character the owner has already kept.
2. **The look first, two candidates at a time.** `create_character` with rule 8's parameters and rule 9's description, 1 generation each. Every candidate is shown to the owner in a camp scene at 320×180, scaled 4×, beside a set already kept, with all four rotations visible: a defect often shows in one direction only. A description cannot be changed after creation, so a change of wording is a new character. Each candidate is tagged `heat`, `hero` and its class as soon as it is created (rule 7). Re-roll until the owner keeps one.
3. **Tag what is not kept** `rejected` as well (rule 7): every candidate the owner does not keep, and any look the kept one replaces. Rejected characters are left for the owner to delete on PixelLab's website, because deleting is permanent.
4. **Hand edits come before animation.** If the owner touches up the rotations in PixelLab's online editor (rule 10), fetch the four rotations before and after and diff them pixel by pixel. The diff goes into the provenance.
5. **The agent frames up the animations, one call per row of rule 11's table.** `animate_character` with `mode: skeleton-v3` and `animation_name` set to the name in HEAT (`walk`, `stance`, `act`, `hit`, `down`), so that the export's folders carry those names; the walk is one call with three directions. No more than 8 directions are queued at once, and `wait_for_jobs` is called with a timeout under 300 seconds until nothing runs (rule 21). Each call's group id and the generations its receipt charges are written into the record that "The script" describes.
6. **The agent writes and checks the files** with `scripts/hero-sprite-set.mjs` (below), and shows the owner every animation, playing and frame by frame, with the script's failures and `review` items marked. The hands are empty in every frame, which no script checks.
7. **The owner reviews and re-rolls, in PixelLab's website.** Any direction the owner does not keep is re-rolled there, with the button that re-rolls one direction of an animation; the agent never re-rolls an animation. The MCP could not do it anyway: PixelLab answers "already complete" to a second skeleton-v3 call for the same template and direction, and its only other route is `delete_animation` and a new call, which is permanent and loses the group. The owner tells the agent which directions were re-rolled, and waives (rule 13) any failure kept as it is.
8. **The agent writes the set again** from the new export, runs the checks, and records each re-roll in the record with `"via": "website"` and its generations read from `get_balance` before and after, since the website shows no receipt. Steps 6 to 8 repeat until the owner keeps every direction.
9. **Commit** the set and its `provenance.json` in the issue's pull request, and say in its description which checks were waived.

## The script

```bash
node scripts/hero-sprite-set.mjs --character <id> --out art/heroes/<set> --record <record.json>
```

It downloads PixelLab's export of the character (the character id is the only key the download needs), writes rule 11's 46 files from the export's own bytes, and checks each written file against the export by SHA-256. It then runs the checks of rule 13 that a script can run:

- **Failures** (exit code 1): a missing animation or a wrong frame count; a height drift over 2 px in any animation except `down`, where the figure falls.
- **Review:** pixels detached from the figure's body; pixels in a colour more than 48 RGB units from every colour of the character's rotations. A redrawn pose carries shades a step off the rotation's, so nearer colours are counted but not listed.

The record is the agent's note of what the export does not hold, from which the script writes `provenance.json` (rule 5):

```json
{
  "name": "Fighter 02",
  "classes": ["fighter"],
  "presentation": "masculine",
  "characterGenerations": 1,
  "handEdits": ["2 px at the eye of the east rotation ..."],
  "animations": {
    "walk": { "groupId": "...", "calls": [{ "directions": ["south", "east", "north"], "generations": 9 }] },
    "act": { "groupId": "...", "source": "lead-jab", "calls": [{ "directions": ["east"], "generations": 2 }] }
  }
}
```

`source` names an animation that carries another name in PixelLab. `--mirror-west` writes `still-west.png` as the east rotation mirrored, where the owner finds the west rotation bad (rule 11). `--zip <file>` reads an export already downloaded.

## A monster

The same steps, with four differences (`docs/process/assets.md`, rules 28 and 29):

- The inputs are the monster, for example `wolf`, in place of the class and the presentation, and the set is named `<monster>-<nn>` under `art/monsters/`.
- Every candidate is shown in a battle line-up as well, facing west (the east rotation mirrored) opposite a kept hero.
- A four-legged monster's walk and stance are `mode: template`, and its act, hit and down `mode: v3`, so its record names each animation's `template` or `mode` and `actionDescription`, its `frames`, and the act's `holdFrame`, chosen by eye.
- The record says `"kind": "monster"` and lists `monsters`, the candidates not kept as `rejected`, and for a quadruped the `characterParameters` that differ from rule 8.
- A monster made before the engine has it (rule 5) has an empty `monsters`, a `madeFor` and its PixelLab `tags` in full; an animation made and not used, such as the jab beside a throw (rule 28), is listed under `notKept`, and the act's `source`, `template`, `frames` and `holdFrame` name the one kept.

A prop, such as a tree, is an object, not a character: rules 30 and 31, and `node scripts/prop-sprite-set.mjs --object <id> --out art/props/<set> --record <record.json>`, whose header gives the record's shape.

## Cost

About 22 generations a set through the MCP: 1 for the character, 3 for each of six skeleton directions of 6 to 8 frames, and 2 for the three-frame act (rule 12).

## Why

The order, look first and animation only after the owner keeps it, comes from Issue-73: animating costs about twenty times a look, and a look that is rejected after animation wastes all of it. The split of steps 5 to 8 was agreed in the same issue, once it was clear that the website re-rolls one direction in place and the MCP cannot. Showing every rotation in the scene comes from the same issue, where one candidate was right facing south and had an oversized eye facing east. The script's colour distance and detached-pixel checks were set on 2026-10-19 against Ranger 01, which passes both, and the first party, where they found a fragment floating off the priest's fist that the colour check alone missed.
