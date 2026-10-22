# Generated assets

How HEAT's art and audio are made, recorded and committed. The services, the licences and the alternatives that were rejected are in decision 0025.

## Rules

### Who makes an asset, and where it lives

1. **The services.** Pixel art comes from PixelLab. Sound effects, and later music, come from ElevenLabs. Nothing else generates assets for HEAT without a new decision.
2. **The agent generates, through the owner's connectors.** Each service is reached through an MCP connector attached to the owner's claude.ai account. The service's token lives in that connector and nowhere else: not in the repository, not in a local Claude configuration, not in a GitHub environment. PixelLab's connector is a custom connector at `https://api.pixellab.ai/mcp`, with No sign-in and a required `authorization` request header holding `Bearer <token>`; it has to be added in the claude.ai web interface, because added from the desktop app the header was not sent.
3. **Never in CI, never at build time.** An asset is generated once, in a session, chosen by the owner, and committed. The build only reads committed files.
4. **The committed files are the asset of record.** Assets live under `art/<kind>/<set>/`, for example `art/heroes/ranger-01/`. The game uses these files; it never needs the service to still hold them.
5. **Every set carries its provenance.** `provenance.json` beside the files records what the service's own export does not: the service, the plan and the date of the terms the set was made under, the service's ids, a hero set's classes and presentation (masculine, feminine or either), every parameter of every generation call, whether it was made through the MCP or on the service's website, the generations it cost, and the act's hold frame. `art/heroes/ranger-01/provenance.json` is the shape to copy.
6. **Committed files match the service's export.** Before a set is committed, its files are compared byte for byte with the same files in the service's download of it.
7. **Characters and objects are tagged in PixelLab when they are made.** Every character made for HEAT is tagged `heat`, its kind (`hero` or `monster`) and its class or monster as soon as it is created, kept or not, so that it can be found among the account's other characters; every object, such as a facility sprite, is tagged `heat`, `facility` and its kind (`heroes-hall`, `job-board`, `warehouse`) with `update_object_tags`, and every interface icon `heat`, `ui-icon` and what it stands for. One that is not kept, or a kept one that is later replaced, also gets `rejected`, so the rejects can be found together and deleted on PixelLab's website. Tilesets cannot be tagged; their rejects are found by the ids in the kept set's provenance. The tag filter matches any of the tags given, so the kept pieces are found under `art/`, each with its PixelLab id in its provenance. A PixelLab website project is not visible through the MCP.

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
17. **A facility's level may change its sprite, never its canvas or its angle.** Each facility is `art/facilities/<kind>/level-<n>.png`, with one `provenance.json` for all its levels; a level with no file of its own shows the highest level below it that has one. Level 0 is a facility the camp has not built: an unfinished building or a cleared site, on the same canvas and at the same angle as its level 1 (Issue-89). A shared facility, such as the job board, is one sprite at every location.
18. **Facilities stand by their base, like heroes by their feet.** Whatever draws a facility puts the lowest opaque row of the sprite on the facility's base line, with the canvas centred on its spot; the files stay as PixelLab exports them. Facilities and heroes are drawn back to front by the line they stand on. In the camp a hero is drawn at half the scene's scale, rounded up, and a facility at the scene's (decision 0028, as amended by Issue-99), so the art is drawn at its own size and the scene does the scaling.
19. **Chosen in the scene.** A camp's pieces are rolled two or more at a time and chosen by the owner in a mock-up of the whole camp map at 3× or 4×, with kept hero sets standing in it. The provenance lists the candidates that were not kept, with their PixelLab ids.

### Working with the service

20. **Budget.** The plan gives 2,000 generations a cycle; `get_balance` reports what is left. A hero set or a humanoid monster costs about 22, a four-legged monster about 9, a prop about 3, a re-rolled direction 3, a facility sprite 1, a tileset 3 or 4 and a pack of 64 icon candidates 10.
21. **Limits.** At most 8 jobs run at once, so a set is queued in batches. `wait_for_jobs` is called with a timeout under 300 seconds and called again: a wait of 540 seconds timed out on PixelLab's side although the job had finished. A job that fails with "heavy load" is retried once and is not charged. A skeleton animation is not made twice for the same template and direction, and the MCP has no re-roll. So the work is split: the agent queues a set's animations and checks the result; the owner reviews them and re-rolls any direction with the button on PixelLab's website, and the provenance records that call as made on the website.

### Audio

22. **Sound effects** may be made and used commercially on the owner's paid ElevenLabs plan, with no attribution.
23. **Music is not made for release** until ElevenLabs has answered in writing whether a single-member company qualifies for a plan marked "For Individual Use Only" (decision 0025).
24. **The ElevenLabs connector waits.** Its hosted MCP manages agents only, and its creative tools are announced but not live; it is connected when they are.

### Interface icons

25. **Icons are 32 px and drawn at a whole-number scale.** An icon of the page, such as a facility's entry in the menu, and the favicon, are 32×32 PixelLab objects, shown at 1× (32 CSS px) or a whole multiple with `image-rendering: pixelated`, so each art pixel stays square, as the scene's are. They share the scene's look: black outline, warm earthy tones, few colours.
26. **Rolled as one pack.** `create_1_direction_object` with `view: top-down`, the description `small game menu icon, black outline, warm earthy tones, NES-era retro pixel art, few colors`, one `item_descriptions` entry per idea (several ideas for each icon), and a 32×32 piece of kept art as the one style image; the style image sets the size, so `size` is not passed. One call returns 64 candidates in one style for 10 generations; ideas beyond those described are filled in by the service.
27. **Chosen from a numbered sheet.** The owner picks from all the candidates side by side at 3×. The picks are promoted with `select_object_frames` and tagged (rule 7); the review object that holds the rest is tagged `rejected`. The icons live in `art/icons/`, one file per icon named for what it stands for, with one `provenance.json` for the pack.

### Monsters and props

28. **A monster is a sprite set like a hero's,** with the same files and the same five animations, made by the same runbook and script, in `art/monsters/<monster>-<nn>/`. Its description is `<appearance>, warm earthy tones, NES-era retro pixel art, few colors`, with `empty hands, no weapon, no shield` before the tones for a monster that has hands. Its provenance lists the `monsters` it draws in place of a hero's classes and presentation, and the candidates not kept; it is tagged `heat`, `monster` and the monster (rule 7). A humanoid monster follows rules 8 to 11 exactly. A four-legged one is `create_character` with `body_type: quadruped` and the nearest of PixelLab's animal templates (`dog` for the wolf), with the rest of rule 8. A quadruped has no skeleton for `skeleton-v3`, and its templates have no fight, so its animations are:

    | Name in HEAT | How | Directions | Cost |
    | --- | --- | --- | --- |
    | walk | `mode: template`, the template's 6-frame walk | south, east, north | 1 a direction |
    | stance | `mode: template`, the template's idle | east | 1 |
    | act, hit, down | `mode: v3`, an `action_description` of the movement alone; frame 0 is the east rotation | east | 1 each |

    A `v3` act has no fixed hold frame: the frame where the action lands is chosen by eye and recorded as `holdFrame`, and the act plays the frames before it, holds it for as long as the action lasts, then plays the rest. A quadruped set costs about 9 generations.
29. **A monster is checked as a hero is** (rule 13), with one difference: a monster that lunges or crouches changes height by design, so the owner may waive its act and hit on sight, and the waiver is recorded.
30. **A prop is an object, not a character.** A resource the battle acts on, such as a tree, is one sprite with no directions, made like a facility (rule 15) on a canvas of whole 16 px tiles (a tree 48×64), and lives in `art/props/<prop>-<nn>/` as `standing.png`, `hit-<i>.png` and `down-<i>.png`, the last frame of `down` held. Its `hit` and `down` are `animate_object` with `mode: v3`, 1 generation each, and the description says `no particles, no effects`, because the first battle draws no effect sprites. A `down` that leaves something behind, such as a stump, is drawn by making that end state first with `create_object_state` and interpolating to it with `end_frame`. PixelLab draws no partial transparency, so whatever goes away, such as the tree's crown, is described as staying in place, and whatever draws a `down` marked `fadeAboveEnd` fades every row above the top row of its last frame's picture, evenly from fully drawn on the first frame to gone on the last, and draws the rows below as they are; so what goes away fades while the end state forms. An object's animation can be made again through the MCP, unlike a character's (rule 21), so the agent makes it again on the owner's word, and the provenance lists the one it replaced. A prop, its end state too, is tagged `heat`, `prop` and the prop.
31. **A prop stands by its base,** as a facility does (rule 18), and is drawn at a monster's scale. `scripts/prop-sprite-set.mjs` writes its files from PixelLab's export and its provenance from the agent's record.

## Why

**Generated once, committed, with its provenance.** A service's output cannot be reproduced on demand: the same call gives a different result, the service may change or close, and the terms the asset was made under can change after it was made. The committed file and a record of how it was made are what last. The provenance is also the licence evidence if a question ever comes up.

**Tags on every character.** The first party's sets left 23 characters that were not kept and carried no tag, findable only by name (Issue-76).

**Connectors on the account.** The agent needs the tools in every session and on every machine the owner uses; the account is the one place that is true. A token in a repository or a CI environment is a credential with no reason to be there.

**The hero sprite set.** Each rule in rules 8 to 13 was chosen by the owner after looking at the alternatives in the game's own scale and setting on 2026-10-18; decision 0025 lists what was tried. The set is the same for every class so that a class's pool of sprite sets can grow by adding sets, with no per-class art rules.

**Hand edits and the mirrored west still.** Re-rolling a look for one bad pixel throws away a look the owner otherwise kept, and an edit made before animation carries into every frame. A west rotation can be bad where the east one is not, and the mirror is what the animations already use for west. Both were added with the first party's sets (Issue-73), with the cost read from their receipts.

**Lining frames up by the feet.** PixelLab places the figure differently on each animation's canvas: in most sets the walk south stands about 8 px higher than the other directions, and every `down` ends with the body 9 to 11 px above where the feet stood. Measuring from the pixels fixes every set, present and future, without editing the exported files (Issue-73).

**A camp's art.** Rules 14 to 19 were chosen by the owner in a mock-up of the first camp (Issue-80, decision 0027). A tileset gives every location the same ground in the same style, laid out by the scene; a painted background would have to be redrawn whenever a camp's facilities change, and two players' camps at one location can have different ones. A facility is one sprite because a building assembled from 16 px wall pieces is boxy at this scale. A level keeps its canvas and angle so that an upgrade swaps the picture in place.

**Interface icons.** Rules 25 to 27 come from the first pack (Issue-89): the page's menu needed an icon per facility and the client still had Angular's default favicon. One call for every icon keeps them in one style and costs less than one call per icon; PixelLab's own panel tool (`create_ui_asset`) draws panels of 192 px and up, not icons. 32 px is the favicon's own size and reads at 1× in a menu.

**Monsters and props.** Rules 28 to 31 come from the first battle's art (Issue-111). A monster is a hero's set so that whatever draws a hero draws a monster. The quadruped's rows were found by trying: `skeleton-v3` refused the wolf ("no stored 3D skeleton"), uncharged, and the dog template has walks and idles but nothing that fights. The tree's first `down`, described alone, broke the trunk into a stump and left the crown floating in the air; its first `hit` drew white puffs at the trunk, an effect sprite by another name. Interpolated to a stump, the crown still vanished between two frames, whether it lifted, sank or was asked to fade, because PixelLab has no partial transparency; the owner chose the fade drawn in code, starting on the first frame rather than after the last. The owner also chose the stump state and the interpolation, and waived the wolf's lunge and flinch drifts on sight.
