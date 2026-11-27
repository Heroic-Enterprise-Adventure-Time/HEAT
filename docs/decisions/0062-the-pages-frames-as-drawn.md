# 0062: The page's frames as drawn: PixelLab's 9-slice art at 1×, the buttons' states in CSS, and the actions' icons

- **Status:** Decided; built by Issue-385.
- **Date:** 2026-11-26
- **Settles:** Issue-385: how the frames decision 0061 left to art are made and drawn, how a button shows its states on them, and which icons the page's actions take. These are the owner's calls of 2026-11-26.
- **Supersedes:** 0061, "**The raised edge is subtle.**", and its first amendment's edge and corner for the frames, which Issue-385 was to draw to.

## Decision

**The frames are PixelLab's, and the edge is the art's.** The panel, the primary button and the secondary button are rolled together as one template of PixelLab's UI tool, `create_ui_asset`, with A2's palette, and split into one picture each, kept under `art/frames/` byte for byte as the service exports them. The tool draws nothing smaller than 192 px and promises no exact edge. Its probe gave a panel with a heavier border than 0061's, dark wood with corner brackets and a solid lower edge, and buttons with stepped corners, and the owner took it for that border, as more like a game of the 1990s and less like a web page. So the raised edge is as drawn, not subtle.

**A frame is drawn at 1×.** Each pixel of the art is a pixel of the page. Its corners are drawn as they are, and its edges and middle repeat, never stretch, with `image-rendering: pixelated`, so a fleck stays one square pixel. Each frame's slice is chosen by measurement and recorded in its provenance. The build trims each picture, names it for its hash and writes the frames into a stylesheet the page is built with (`docs/process/assets.md`, rules 40 and 41).

**A button's states are CSS on its normal frame.** Pressed is the frame a shade darker, its label sunk by a press of its own (`--button-press`); disabled is the frame drained of colour; focus is a ring that follows the frame's stepped outline, the frame's shape cast four ways by `drop-shadow` with no blur. Each state keeps the frame's depth, and nothing around a button moves. This keeps 0061's "states stay in plain CSS".

**The art carries A2's colours.** A change of the page's theme rolls the frames again rather than recolouring them: the frames are the one part of the page the role tokens do not reach. The tokens `--frame-outline`, `--frame-edge` and `--frame-corner` stay for what CSS still draws: the hero tile, the chip and the slot circles.

**The actions' icons** are 32-pixel PixelLab icons beside the others under `art/icons/`, each shown on its button with its word: `depart`, crossed swords, since leaving the camp almost always means a fight; `recruit`, `build`, `replays`, `settings` and `more`; and two ways out. `close`, a red X, leaves a view that sits over the camp: a replay, the open adventure or a menu. `back`, a green arrow, is for a view that steps back through others rather than closing.

## Considered and not chosen

- **The frames kept in CSS at 0061's exact edge, after the probe.** The agent recommended it, since the art pulled toward a heavier look than 0061 had settled. The owner preferred the art.
- **Each state a frame of its own, drawn by `create_ui_states`.** The drawn pressed state put its shadow along the top, which reads as sunk in rather than pushed down, and the drawn disabled state lost the button's depth. Neither was kept; the call is in the frames' provenance for its cost.
- **A pressed frame made by cutting the art's lower edge away.** The shadow runs through the stepped corners, so cutting it out would redraw the corners.
- **A rectangular focus outline.** It sat oddly around a stepped frame.
- **Depart as a signpost or a road.** It reads as travel, not combat, and the menu's adventure icon is already a road with a signpost. The first roll's crossed swords came with a pack or a scroll beside them, which did not mesh, and were rolled again.
- **Back as a curved arrow alone.** A red X is the usual sign in a mobile game for leaving what sits over the main view. The arrow stays for where a view does step back.

## Where it is described

`docs/process/assets.md`, rules 25 and 40 to 42; `art/frames/` and `art/icons/` with their provenance; `packages/client/src/primitives.css`; `FRAMES` and `PORTRAIT` in `packages/client/src/app/sprite-sets.ts`.
