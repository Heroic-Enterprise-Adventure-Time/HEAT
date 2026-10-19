# Making a hero sprite set

How one hero sprite set is made with PixelLab, from an appearance and a class to committed files under `art/heroes/` with their provenance. The rules are `docs/process/assets.md`, rules 5 to 15; this runbook is the order of work and the tooling, and does not repeat them. The Claude Code skill `.claude/skills/hero-sprite-set/` points here.

## Rules

1. **Inputs.** The class, for example `fighter`; the set's name, `<class>-<nn>`, numbered like the PixelLab character it comes from; and the appearance, the part of the description that changes (assets.md, rule 9), for example `fighter in a brown leather jerkin over chain mail, short dark hair`. Or a PixelLab character the owner has already kept.
2. **The look first, two candidates at a time.** `create_character` with rule 8's parameters and rule 9's description, 1 generation each. Every candidate is shown to the owner in a camp scene at 320×180, scaled 4×, beside a set already kept, with all four rotations visible: a defect often shows in one direction only. A description cannot be changed after creation, so a change of wording is a new character. Re-roll until the owner keeps one.
3. **Tag the kept look** `heat`, `hero` and its class (rule 7), and take the tags off any look it replaces. A rejected character is left for the owner to delete on PixelLab's website: deleting is permanent.
4. **Hand edits come before animation.** If the owner touches up the rotations in PixelLab's online editor (rule 10), fetch the four rotations before and after and diff them pixel by pixel. The diff goes into the provenance.
5. **Animate, one call per row of rule 11's table.** `animate_character` with `mode: skeleton-v3` and `animation_name` set to the name in HEAT (`walk`, `stance`, `act`, `hit`, `down`), so that the export's folders carry those names; the walk is one call with three directions. No more than 8 directions are queued at once, and `wait_for_jobs` is called with a timeout under 300 seconds until nothing runs (rule 15). Each call's group id and the generations its receipt charges are written into the record that "The script" describes.
6. **A direction that fails is re-rolled by the owner, on PixelLab's website.** PixelLab answers "already complete" to a second skeleton-v3 call for the same template and direction, and the MCP has no re-roll; its only route is `delete_animation` and a new call, which loses the animation's group and is permanent. The website has a re-roll button for one direction of an animation. The agent then runs step 7 again and records the call in the record with `"via": "website"`.
7. **Write and check the files** with `scripts/hero-sprite-set.mjs` (below). A set with a failure is merged only after the owner has re-rolled the direction or waived the check (rule 13). Every item under `review` is looked at with the owner.
8. **Look at every animation, playing and frame by frame,** with the owner: the hands are empty in every frame, which no script checks.
9. **Commit** the set and its `provenance.json` in the issue's pull request, and say in its description which checks failed or were waived.

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
  "characterGenerations": 1,
  "handEdits": ["2 px at the eye of the east rotation ..."],
  "animations": {
    "walk": { "groupId": "...", "calls": [{ "directions": ["south", "east", "north"], "generations": 9 }] },
    "act": { "groupId": "...", "source": "lead-jab", "calls": [{ "directions": ["east"], "generations": 2 }] }
  }
}
```

`source` names an animation that carries another name in PixelLab. `--mirror-west` writes `still-west.png` as the east rotation mirrored, where the owner finds the west rotation bad (rule 11). `--zip <file>` reads an export already downloaded.

## Cost

About 22 generations a set through the MCP: 1 for the character, 3 for each of six skeleton directions of 6 to 8 frames, and 2 for the three-frame act (rule 12).

## Why

The order, look first and animation only after the owner keeps it, comes from Issue-73: animating costs about twenty times a look, and a look that is rejected after animation wastes all of it. Showing every rotation in the scene comes from the same issue, where one candidate was right facing south and had an oversized eye facing east. The script's colour distance and detached-pixel checks were set on 2026-10-19 against Ranger 01, which passes both, and the first party, where they found a fragment floating off the priest's fist that the colour check alone missed.
