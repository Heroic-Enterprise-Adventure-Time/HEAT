# Making a resource's icon

How one icon under `art/icons/` is made with PixelLab, from a resource's name to a committed file with its provenance. A facility's icon is made the same way. The rules are `docs/process/assets.md`, rules 5 to 7, 25 to 27 and 38; this runbook is the order of work and the script that draws the sheet and writes the file.

## Rules

1. **Inputs.** The resource's name as the engine's `MATERIALS` has it, for example `cloth`, which is the file's name; and three to six ideas of what its icon shows, each a short phrase such as `folded bolt of woven cloth`.
2. **Look in the packs first.** `art/icons/provenance.json` has an entry for each pack with its `itemDescriptions` and a note of the ideas it carries. A pack that already holds candidates for the resource is picked from, at no generation and in the style of the icons beside it: cloth's are candidates 16 to 20 of `thirdPack`. Only where no pack holds any is a new one rolled, by rule 26, with ideas for every resource known to be coming, since a later roll may not match; it is a new entry in the provenance, `<nth>Pack`, with its call.
3. **The frames' address.** `get_object` on the pack's `reviewObjectId` prints the address of its candidate frames, with `{i}` for the index, and the indices still in it. The address carries the PixelLab account's id: it is passed to the script and written into no file.
4. **The sheet.** `node scripts/icon-set.mjs sheet --frames "<address>" --indices <as get_object lists them> --out <file in the scratchpad>` draws every candidate at 3× on the battle scene's green, each under its index as rolled. The owner picks from it; the agent says which it would take and why, and shows the resource's candidates again at 4× where they are hard to tell apart.
5. **Promote and tag.** `select_object_frames` with the picked indices makes each its own object; `update_object_tags` gives each `heat`, `ui-icon` and the name (rule 7). The review object keeps its tags, `rejected` among them. A frame once promoted has left the review object, so the next step's `--frames` check is only possible from a copy of the frame saved before.
6. **Keep.** `node scripts/icon-set.mjs keep --object <new object's id> --name <name> --pack <pack> --candidate <index>` writes `art/icons/<name>.png` from the service's download, byte for byte, and the icon's entry in the provenance; it refuses a picture that is not 32 by 32. Run again, it checks the committed file against the service and writes nothing.
7. **The pack's entry, by hand.** `chosenBy` gains who picked what and when, `verified` what was compared, and `rejects` the count left (rule 27).
8. **Check.** `npm test` runs `packages/engine/test/resource-art.test.ts`, which holds that every resource an enemy drops has its icon. The battle scene draws the icon where an enemy drops the resource with nothing more written: its build copies `art/icons/` as it is. The icon is looked at there, on the dev server (`docs/runbooks/dev-server.md`), before the pull request opens.

## Cost

Nothing where a pack holds the candidates. A new pack of 64 candidates is 10 generations (rule 20).

## Why

The owner's call was that an icon for a resource is a thing that will be made again, and that its making should be repeatable. Timber and ore were made by hand in this order (Issue-344), with a sheet drawn by a script that lived in a scratchpad, and the steps a session would not guess were written down here: the candidates already rolled, the address that must not be committed, and the check that is lost once a frame is promoted.
