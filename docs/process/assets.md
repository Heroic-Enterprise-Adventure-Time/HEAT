# Generated assets

How HEAT's art and audio are made, recorded and committed. The services, the licences and the alternatives that were rejected are in decision 0025.

## Rules

### Who makes an asset, and where it lives

1. **The services.** Pixel art comes from PixelLab. Sound effects, and later music, come from ElevenLabs. Nothing else generates assets for HEAT without a new decision.
2. **The agent generates, through the owner's connectors.** Each service is reached through an MCP connector attached to the owner's claude.ai account. The service's token lives in that connector and nowhere else: not in the repository, not in a local Claude configuration, not in a GitHub environment. PixelLab's connector is a custom connector at `https://api.pixellab.ai/mcp`, with No sign-in and a required `authorization` request header holding `Bearer <token>`; it has to be added in the claude.ai web interface, because added from the desktop app the header was not sent.
3. **Never in CI, never at build time.** An asset is generated once, in a session, chosen by the owner, and committed. The build only reads committed files.
4. **The committed files are the asset of record.** Assets live under `art/<kind>/<set>/`, for example `art/heroes/ranger-01/`. The game uses these files; it never needs the service to still hold them.
5. **Every set carries its provenance.** `provenance.json` beside the files records what the service's own export does not: the service, the plan and the date of the terms the set was made under, the service's ids, every parameter of every generation call, whether it was made through the MCP or on the service's website, the generations it cost, and the act's hold frame. `art/heroes/ranger-01/provenance.json` is the shape to copy.
6. **Committed files match the service's export.** Before a set is committed, its files are compared byte for byte with the same files in the service's download of it.
7. **Characters are tagged in PixelLab when they are made.** Every character made for HEAT is tagged `heat`, its kind (`hero`) and its class as soon as it is created, kept or not, so that it can be found among the account's other characters. One that is not kept, or a kept look that is later replaced, also gets `rejected`, so the rejects can be found together and deleted on PixelLab's website. The tag filter matches any of the tags given, so the kept sets are found in `art/heroes/`, each with its PixelLab id in its provenance. A PixelLab website project is not visible through the MCP.

### A hero sprite set

8. **The base character.** `create_character` with:

   | Parameter | Value |
   | --- | --- |
   | `mode` | `standard` (1 generation) |
   | `n_directions` | `4` |
   | `size` | `32` (stored on a 48×48 canvas) |
   | `view` | `low top-down` |
   | `outline` | `single color black outline` |
   | `shading` | `flat shading` |
   | `detail` | `low detail` |
   | `proportions` | default |

9. **The description** is `<appearance>, empty hands, no weapon, no shield, warm earthy tones, NES-era retro pixel art, few colors`. Only `<appearance>` changes from set to set. Characters hold nothing: an action's weapon or spell is a separate effect sprite.
10. **Full colour, touched up by hand.** No colour reduction and no shared palette. Before any animation, the owner may correct single pixels of the rotations in PixelLab's online editor rather than re-roll a look; the animations are built from the edited rotations, and the provenance records every changed pixel.
11. **The animations,** `animate_character` with `mode: skeleton-v3`, which costs 3 generations a direction through the MCP, 2 for the three-frame act:

    | Name in HEAT | Template | Directions | Frames | Played as |
    | --- | --- | --- | --- | --- |
    | walk | `walking` | south, east, north | 6 | a loop |
    | stance | `fight-stance-idle-8-frames` | east | 8 | a loop, in battle between actions |
    | act | `lead-jab` | east | 3 | frame 0, frame 1 held for as long as the action lasts, frame 2 |
    | hit | `taking-punch` | east | 6 | once |
    | down | `falling-back-death` | east | 7 | once, last frame held |

    West is east mirrored. A hero standing outside battle is its still frame: there is no idle animation. The four still frames are the character's rotations; where the owner finds the west rotation bad, `still-west.png` is the east rotation mirrored, and the provenance says so.
    **Frames are lined up by the figure's feet, not by the canvas.** Whatever draws a set puts the lowest opaque pixel of the south still on the spot where the hero stands, and moves each animation by one amount, so that its first frame's lowest pixel lands there too; `down` is moved frame by frame instead, each frame's lowest pixel onto that spot, so the body lands where the feet were. The files stay as PixelLab exports them.
12. **The cost** of a set is about 22 generations: 1 for the character and 21 for seven animated directions.
13. **Checks before keeping a set.** The hands are empty in every frame. The figure's height varies by no more than 2 px across each animation but `down`, where the figure falls. No stray pixels: none detached from the figure, and none of a colour far from the character's own. A set that fails is re-rolled by the owner, one direction at a time (rule 21), or the owner waives the check for that direction. `docs/runbooks/hero-sprite-set.md` is the order of work, and its script runs every check but the hands.

### A camp's art

14. **The ground is a tileset.** `create_topdown_tileset` with `mode: standard`, `view: low top-down`, 16×16 tiles, `outline: lineless`, `shading: flat shading`, `detail: low detail`, each terrain described as `<terrain>, warm earthy tones, NES-era retro pixel art, few colors`. The ground has no outline, so that the outlined buildings and heroes stand off it. A tileset costs 3 or 4 generations. A new terrain is joined to an existing one by passing that one's base tile id (`lower_base_tile_id` or `upper_base_tile_id`), so the two connect. It is committed as `art/ground/<set>/tileset.png` and `tileset.json`, the sheet and PixelLab's metadata exactly as downloaded; whatever draws the ground picks each tile by its four corners and cuts it out by its `bounding_box`.
15. **A facility is one sprite, not built from tiles.** `create_map_object` with no background image, `view: low top-down`, `outline: single color outline`, `shading: flat shading`, `detail: low detail`, described as `<building>, black outline, warm earthy tones, NES-era retro pixel art, few colors`. The canvas is a whole number of 16 px tiles in each direction: the heroes hall 64×64, the warehouse 48×48, the job board 32×32. A call costs 1 generation.
16. **One angle for every facility:** three-quarter, the front wall facing down-right and a side wall showing, as the heroes hall draws it. A head-on building came out flat. Adding `seen at a slight angle so its side wall shows, three-quarter view` to the description gave the angle; a call that misses it is rolled again.
17. **A facility's level may change its sprite, never its canvas or its angle.** Each facility is `art/facilities/<kind>/level-<n>.png`, with one `provenance.json` for all its levels; a level with no file of its own shows the highest level below it that has one. A shared facility, such as the job board, is one sprite at every location.
18. **Facilities stand by their base, like heroes by their feet.** Whatever draws a facility puts the lowest opaque row of the sprite on the facility's base line, with the canvas centred on its spot; the files stay as PixelLab exports them. Facilities and heroes are drawn back to front by the line they stand on.
19. **Chosen in the scene.** A camp's pieces are rolled two or more at a time and chosen by the owner in a 320×180 mock-up of the camp at 4×, with kept hero sets standing in it. The provenance lists the candidates that were not kept, with their PixelLab ids.

### Working with the service

20. **Budget.** The plan gives 2,000 generations a cycle; `get_balance` reports what is left. A hero set costs about 22, a re-rolled direction 3, a facility sprite 1 and a tileset 3 or 4.
21. **Limits.** At most 8 jobs run at once, so a set is queued in batches. `wait_for_jobs` is called with a timeout under 300 seconds and called again: a wait of 540 seconds timed out on PixelLab's side although the job had finished. A job that fails with "heavy load" is retried once and is not charged. A skeleton animation is not made twice for the same template and direction, and the MCP has no re-roll. So the work is split: the agent queues a set's animations and checks the result; the owner reviews them and re-rolls any direction with the button on PixelLab's website, and the provenance records that call as made on the website.

### Audio

22. **Sound effects** may be made and used commercially on the owner's paid ElevenLabs plan, with no attribution.
23. **Music is not made for release** until ElevenLabs has answered in writing whether a single-member company qualifies for a plan marked "For Individual Use Only" (decision 0025).
24. **The ElevenLabs connector waits.** Its hosted MCP manages agents only, and its creative tools are announced but not live; it is connected when they are.

## Why

**Generated once, committed, with its provenance.** A service's output cannot be reproduced on demand: the same call gives a different result, the service may change or close, and the terms the asset was made under can change after it was made. The committed file and a record of how it was made are what last. The provenance is also the licence evidence if a question ever comes up.

**Tags on every character.** The first party's sets left 23 characters that were not kept and carried no tag, findable only by name (Issue-76).

**Connectors on the account.** The agent needs the tools in every session and on every machine the owner uses; the account is the one place that is true. A token in a repository or a CI environment is a credential with no reason to be there.

**The hero sprite set.** Each rule in rules 8 to 13 was chosen by the owner after looking at the alternatives in the game's own scale and setting on 2026-10-18; decision 0025 lists what was tried. The set is the same for every class so that a class's pool of sprite sets can grow by adding sets, with no per-class art rules.

**Hand edits and the mirrored west still.** Re-rolling a look for one bad pixel throws away a look the owner otherwise kept, and an edit made before animation carries into every frame. A west rotation can be bad where the east one is not, and the mirror is what the animations already use for west. Both were added with the first party's sets (Issue-73), with the cost read from their receipts.

**Lining frames up by the feet.** PixelLab places the figure differently on each animation's canvas: in most sets the walk south stands about 8 px higher than the other directions, and every `down` ends with the body 9 to 11 px above where the feet stood. Measuring from the pixels fixes every set, present and future, without editing the exported files (Issue-73).

**A camp's art.** Rules 14 to 19 were chosen by the owner in a mock-up of the first camp (Issue-80, decision 0027). A tileset gives every location the same ground in the same style, laid out by the scene; a painted background would have to be redrawn whenever a camp's facilities change, and two players' camps at one location can have different ones. A facility is one sprite because a building assembled from 16 px wall pieces is boxy at this scale. A level keeps its canvas and angle so that an upgrade swaps the picture in place.
