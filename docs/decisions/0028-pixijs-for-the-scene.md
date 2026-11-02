# 0028: PixiJS draws the camp scene

- **Status:** Decided; amended 2026-10-20 by Issue-89 (the stage fills its box), 2026-10-21 by Issue-99 (heroes at half the scene's scale), 2026-10-21 by Issue-95 (the scale counts device pixels), 2026-10-22 by Issue-15 (the battle scene) and 2026-10-22 by Issue-130 (an action's weapon and effect)
- **Date:** 2026-10-20
- **Settles:** Issue-81: what renders the 320×180 scene inside the Angular page, which no document named (raised by the owner in the Issue-80 session).

## Decision

**The scene is drawn with PixiJS 8** (`pixi.js` 8.22.0, pinned like every dependency) inside the Angular page. Its stage is 320×180. The canvas is scaled up by the largest whole number that fits, with nearest-neighbour textures and `image-rendering: pixelated`, so each art pixel is a square of screen pixels. Pixi supplies:

- the textures and sprites;
- the frame loop;
- pointer events on sprites, which is how a facility or a hero is clicked;
- sorting by depth, which draws heroes and facilities back to front by the line they stand on (`docs/process/assets.md`, rule 18).

**What Pixi does not own:**
- The page around the scene. The header bar and the panels a click opens (the heroes hall, a hero's card) are Angular elements over the canvas, so they read at any scale.
- The rules. The scene is handed the heroes and reports clicks; it never calls the hub.
- The layout and the wandering. Where facilities stand and how heroes mill about are plain modules in the client, tested without a renderer.

**PixiJS loads after sign-in.** The camp loads it with a dynamic import, so it is a chunk of its own rather than part of the first page. Measured on the first build (Issue-81):
- the scene's chunk: 310 kB raw, 76 kB transferred;
- Pixi's other lazy chunks: about 270 kB raw;
- the initial bundle: from 269 kB to 311 kB, which is the client's own new code (the camp, the header and the engine's content).

**Particles and sound are chosen when they are needed.** An ability's effect is a drawn frame animation (`docs/design/game.md`, "How the game looks"; PixelLab's effects tool exports frames), and Pixi plays those in its core. Pixi's core has `ParticleContainer` for drawing many particles but no emitter. The emitter port for v8 is a small community package (`@spd789562/particle-emitter`), and whether it is maintained was not checked. Sound is not in Pixi's core: `@pixi/sound` 6 is the line for Pixi 8, and Howler.js is the common standalone. Neither is a dependency yet.

## Amendment: the stage fills its box (Issue-89, 2026-10-20)

**The stage is no longer a fixed 320×180.** A camp is a map of whole tiles, Millbrook's 400×225, and the canvas covers the whole box the page gives the scene. The scale is the largest whole number at which the map's height and its core width fit: the middle 352 px that every facility stands inside, so a box a little narrower than the whole map crops bare ground at its edges rather than drop a scale step. The textures are still nearest-neighbour, so each art pixel stays a square of screen pixels. The canvas shows more ground around the map to cover the rest of the box, with the map centred; a box narrower than the map at scale 1, a phone's, crops the map's edges evenly. `packages/client/src/app/camp/page-layout.ts` holds the arithmetic.

**Why.** With the content area beside the scene rather than over it (`docs/design/game.md`, "The page"), a fixed 320×180 left bars around the scene on most screens. The owner asked for the scene to fill its area. Stretching it by a fraction was considered and not chosen: it blurs pixel art or makes its pixels uneven. Filling with more of the world keeps the pixels square and leaves no bars.

**Not solved by this.** On a screen whose device pixel ratio is not a whole number, such as Windows at 125%, the scale counts CSS pixels, so an art pixel is 1.25 device pixels and the pixels come out uneven. That was true before the amendment too. Closed by the Issue-95 amendment below.

## Amendment: heroes at half the scene's scale (Issue-99, 2026-10-21)

**Heroes in the camp are drawn at half the scene's scale, rounded up:** 1 at scene scale 1 and 2, 2 at 3 and 4, 3 at 5. The scale stays a whole number, so a hero's art pixels stay square; the ground and the facilities keep the scene's scale. The canvas therefore renders at the scene's scale, one canvas pixel per CSS pixel, instead of at the map's pixels enlarged by CSS, and each hero is placed on a whole canvas pixel. A hero still stands by its feet (`docs/process/assets.md`, rule 11), its click area shrinks with it, and it walks 18 of its own art pixels a second, so its stride stays in step with its frames. Battle keeps its own scale, and the sprite files do not change. `heroScale` in `page-layout.ts` holds the rule.

**Why.** At the scene's scale a hero stood half as tall as the hall, and the owner found the heroes too large for the camp. In a mock-up of Millbrook at scene scales 3 and 4, half rounded up read as people in a village; at scene scale 3, heroes at 1, half rounded down, were too small to tell apart or click.

## Amendment: the scale counts device pixels (Issue-95, 2026-10-21)

**The scene's scale is the largest whole number of device pixels per art pixel that fits**, not of CSS pixels, so every art pixel is the same square of device pixels at any device pixel ratio, Windows' 125% and 150% included. The canvas covers its box exactly, with one canvas pixel per device pixel, so the browser draws it without scaling. Where the browser reports the box's exact size in device pixels (`ResizeObserver`'s `device-pixel-content-box`: Chrome and Edge 84, Firefox 93; not Safari, by web.dev and MDN), that size is used; elsewhere the CSS size times the ratio, rounded. A change of ratio, browser zoom or a move to another screen, is followed. The page's regions, side by side or stacked, the menu's labels and its icons, are still decided in CSS pixels; the stacked scene's box takes its height from the scale in device pixels.

**Heroes are half the scene's scale, rounded up, never below one CSS pixel per art pixel and never above the scene.** At ratio 1 that is the rule of Issue-99 unchanged. Without the floor, a phone at ratio 2 with the scene at 2 device pixels would draw its heroes at 1, too small to tap.

**What it changes on screen.** At a whole ratio above 1, the scale moves in steps of one device pixel, not one CSS pixel, so the map may stand a step larger. At a fractional ratio the largest whole step may be smaller than the old uneven one: a 1920×1080 laptop at 125% shows the map at 3 device pixels, 2.4 CSS pixels, where it showed 3 CSS pixels as 3.75 uneven device pixels, with more ground around it.

## Amendment: the battle scene (Issue-15, 2026-10-22)

**The battle is a second PixiJS scene, loaded like the camp's, on first use.** Its stage is 320×180 art pixels, scaled by the largest whole number of device pixels at which it fits its box and at least 400 art pixels of road show across, so a wide box shows more of the world rather than the stage closer (the owner's call), with ground around it, as the camp's map is; heroes and monsters are drawn at the stage's own scale, not half of it, since the battle is about them. The ground is the meadow tileset with a road of its lower terrain across the middle, one column of tiles repeated so that it can scroll. The camp's sprites stand side-on (game.md, "How the game looks"): the party on the left facing east, the other side on the right drawn mirrored, each side's four lines from the middle outwards, a line's units spread in depth and a little aside. `packages/client/src/app/adventure/battle/battle-layout.ts` holds the arithmetic, tested without a renderer.

**It draws from the field and animates from the events.** Where everyone stands and how they are comes from `field.ts`, which reads the adventure's events alone, the same for a run being played and a stored timeline being replayed with no engine. An act plays to its hold frame and holds there until the action resolves, then plays the rest; a hit plays on damage or a harvest; a fall plays and its last frame is held, the tree's crown fading as its provenance says (`docs/process/assets.md`, rule 30); a fallen monster or a felled tree lies a moment and then fades away, while a fallen hero stays down; stepping up a line and a collapse are a walk. An act runs on the adventure's clock, because it holds until its action resolves; everything else runs on the presentation clock, the wall clock times the speed, so fast-forward speeds it all and a fall still plays once the adventure's clock has stopped at the end. The frame counts and hold frames are read from each set's `provenance.json`.

**The progression reads left to right** (the owner's call on Issue-15). The party runs on from the left at the start, at four times the pace, since it is no scroll; on a travel it walks in place while the road scrolls left; at a fight or a gather the other side rushes on from the right as the road scrolls with it, which reads as the party rushing to meet it; what is left of a stage scrolls away on the next travel; a retreat runs off to the left. Every run and every scroll goes at one speed, so the progression never changes pace. The rush on is flavor only: the adventure's clock stops at the entry, the party setting out or a fight or gather beginning, and runs again only when the scene says everyone is on, so the first blow is never struck while the other side is still coming on. The timeline, the log and verification are untouched by it. A resumed run places everyone where they stand, with no rush.

**Without WebGL** the scene does not load, the clock does not wait, and the run plays with the controls alone.

## Amendment: an action's weapon and effect (Issue-130, 2026-10-22)

**An action draws two more sprites, in Pixi's core.** While a unit acts, its weapon is a sprite inside the unit's own container, so it is mirrored and sorted with it; its frames play on the adventure's clock with the act, each holding its own hold frame until the action resolves, and each frame's grip, from the weapon's provenance, sits on the leading hand. When the action resolves, the ability's effect is a sprite of its own, sorted just in front of the unit it landed on, playing once on the presentation clock from the frames of the effect's game pack. Both come from the events alone, so a run and a replay show the same. The weapon by unit type and the effect by ability are one engine module, `packages/engine/src/action-art.ts`, which a crafted weapon later replaces for heroes (game.md, "Heroes"). The frame arithmetic is `packages/client/src/app/adventure/battle/action-sprites.ts`, tested without a renderer. The rules for the art are `docs/process/assets.md`, rules 32 to 35.

**Still no particle emitter.** PixelLab's effects tool bakes its particles into frames, so the battle plays frames and needs no emitter library.

## Considered and not chosen

**A plain canvas with its 2D context**, drawn by the client. It needs no dependency and is enough for a few dozen sprites. The agent first recommended it. The owner prefers a library over code of our own, and Pixi's sprites, animation, pointer events and depth sorting are exactly the code a plain canvas would need written.

**Phaser 4**, which has particles and sound built in. It is a game framework that wants to own the page's loop, its input and its scenes, beside Angular, which owns the page. Particles and sound are not needed yet, and the effects are drawn frames.

## Where it is described

`packages/client/src/app/camp/`: the component, and the scene under `scene/`. `packages/client/src/app/adventure/battle/`: the battle scene. `docs/standards/typescript.md`, rule 15, for how the art reaches the build.
