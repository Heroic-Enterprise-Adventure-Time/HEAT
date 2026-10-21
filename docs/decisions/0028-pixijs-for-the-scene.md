# 0028: PixiJS draws the camp scene

- **Status:** Decided; amended 2026-10-20 by Issue-89 (the stage fills its box)
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

**Not solved by this.** On a screen whose device pixel ratio is not a whole number, such as Windows at 125%, the scale counts CSS pixels, so an art pixel is 1.25 device pixels and the pixels come out uneven. That was true before the amendment too.

## Considered and not chosen

**A plain canvas with its 2D context**, drawn by the client. It needs no dependency and is enough for a few dozen sprites. The agent first recommended it. The owner prefers a library over code of our own, and Pixi's sprites, animation, pointer events and depth sorting are exactly the code a plain canvas would need written.

**Phaser 4**, which has particles and sound built in. It is a game framework that wants to own the page's loop, its input and its scenes, beside Angular, which owns the page. Particles and sound are not needed yet, and the effects are drawn frames.

## Where it is described

`packages/client/src/app/camp/`: the component, and the scene under `scene/`. `docs/standards/typescript.md`, rule 15, for how the art reaches the build.
