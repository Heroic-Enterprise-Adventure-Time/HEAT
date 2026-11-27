# 0061: The daylight parchment theme: role tokens over the palette, shared primitives and pixel-art frames

- **Status:** Decided; not built: the tokens, the primitives and the lint by Issue-384, the frames and the action icons by Issue-385, the panels by Issue-386. The palette's values are a sketch, and Issue-384 sets the exact ones.
- **Date:** 2026-11-26
- **Settles:** Issue-383: how the page looks once it reads as a casual mobile game, with less text and with buttons for actions. These are the owner's calls of 2026-11-26.
- **Amends:** 0037, "read by the components with `var()`: the palette, a spacing scale, ...". From Issue-384 on, a component reads a role token, and only `styles.css` reads the palette.

## Decision

**The page has one theme, A2, "daylight parchment", and it is light.** It is a lighter take on today's palette: a light tan page, pale parchment cards, dark brown ink for the frames and the bars, and gold for the main action. The values sketched on 2026-11-26 are page `#d9c7a3`, card `#f7eedb`, soft card `#ecdcbc`, ink `#5a4330`, gold `#e8b55a`, the gold's light edge `#f6d590` and its dark edge `#8a5d1c`. There is no dark variant, so `styles.css` declares `color-scheme: light`. Today it declares `light dark` and has no dark styles.

**Role tokens over the palette.** `styles.css` declares the palette as it does today, a colour named for what it is, and over it a set of role tokens, each named for what it does: the page's surface, a panel's surface, text on a panel, the main action, a refusal, and so on. A component reads only role tokens. Only `styles.css` reads the palette, to map each role onto a colour. A theme then changes in one place, and a lint can tell a component's colour by its role. Issue-384 sets the roles and their names. The rule is `docs/standards/angular.md`, rule 17.

**The scene's colours are roles of their own.** A script that draws with the page's colours reads them through `colourToken` (`docs/process/assets.md`, rule 39). The art build colours a drop's digits that way, today with `--light` and `--ink`. Those become scene roles, `--scene-glyph` and `--scene-glyph-outline`. None of A2's colours is today's near-black or pale, so the palette keeps those two, `#140d08` and `#e6d6b8`, under names of their own for the scene, and the scene roles map onto them: a change of the page's theme never recolours the scene. `scripts/icon-set.mjs`, which numbers its sheet with the same two colours, reads the same roles. The scene keeps its black outline (`docs/design/game.md`, "How the game looks").

**Four shared primitives:**

- a **button**, primary and secondary, with normal, pressed, disabled and focus states;
- a **panel frame**;
- a **resource chip**, a resource's icon and an amount;
- a **hero tile**, picked, not picked or empty.

Each is styled in one place, as global styles or as a component of its own, so that Angular's per-component scoping does not copy it into every panel. A panel builds its controls from these and styles no button of its own.

**The raised edge is subtle.** A frame has a 2px outline and a 4px lower edge, and a button's top edge is a lighter shade of its fill. A hero not picked has a soft tan outline, and only the picked hero has the ink outline. These lengths are pixels of the art, drawn at a whole-number scale, which is where `docs/process/best-practices.md`, rule 10, allows a pixel.

**The frames are pixel art, and everything else is plain CSS.** The panel, the primary button and the secondary button are each a 9-slice image. Each is applied with `border-image` at a whole-number scale with `image-rendering: pixelated`, like the page's icons (`docs/process/assets.md`, rule 25). Layout, colour, type and states stay in plain CSS (decision 0037). Until Issue-385 makes the frames, CSS draws them at the same edge. How a frame is made, and whether a pressed or a disabled state is a frame of its own, is settled at the start of Issue-385 and written into `docs/process/assets.md`.

**Enforcement is stylelint.** A lint refuses a colour literal and a `px` length in any stylesheet but `styles.css`. A colour used once is no exception, as it is for other values (`docs/standards/angular.md`, rule 17). A length that is a pixel of the art, such as a frame's outline and lower edge, or a one-pixel line, is a token declared in `styles.css`, so the lint never has to tell an art pixel from a layout one. Existing literals are moved to tokens or listed as allowed. It runs as a gate job, which is a required check of both rulesets (`docs/process/code-changes.md`, rule 29). Issue-384 chooses the rules and adds the job.

**The page's body text stays `system-ui`.** Whether headings and buttons take a pixel webfont is left open. That would need its own record and a check of the font's licence, because the scene's font is drawn as sprites and the service's TrueType file is not committed (`docs/process/assets.md`, rule 37).

**What the player sees** follows from these, in `docs/design/game.md`, "The page":

- an action is a button and navigation is a link;
- where the regions stack, on a camp's pages, the menu is a nav fixed to the bottom of the window, and the panel is padded by its height; the open adventure and a replay have no nav;
- a panel's secondary views, the replays first, are behind its own "more" (⋯) menu;
- resources are chips, shown by panel;
- the header bar keeps its four items.

## Considered and not chosen

- **Keeping today's dark palette and changing only the controls.** The owner chose a lighter page as part of the casual look.
- **Components reading the palette, as today.** It is simpler while there is one theme. But a change of theme then touches every component, and no lint can tell a colour used as a refusal from the same colour used as a frame.
- **Every frame and state drawn in CSS, with no art.** It is cheaper and needs no art checkpoint. But the frames are where the page's pixel art shows, and the scene beside them is pixel art. CSS draws them only until the art lands.
- **Every frame, state and label as art.** Text, focus rings and disabled states would then be images, which do not follow the player's font size or settings (`docs/process/best-practices.md`, rule 10).
- **All the camp's resources in a chip bar in the header.** This was rejected for the reason `docs/design/game.md` already gives for keeping resources out of the header bar: a camp will hold many kinds. A panel shows the resources that matter to it.
- **One "more" menu in the header for every secondary view.** The replays belong to a panel's subject, a job or the location's board, so they sit behind that panel's own menu.
- **The scene's digits coloured from the page's roles.** The new ink is brown, and the scene's outline is black.
- **A pixel webfont now.** It is left open, for the licence and a record of its own.

## Where it is described

`docs/design/game.md`, "The page"; `docs/standards/angular.md`, rule 17; `docs/process/assets.md`, rule 39; `packages/client/src/styles.css`, from Issue-384.
