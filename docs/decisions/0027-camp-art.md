# 0027: Camp art: a ground tileset and one sprite per facility, at one three-quarter angle

- **Status:** Decided
- **Date:** 2026-10-19
- **Settles:** Issue-80: how the first camp's ground and facilities are drawn, whether a facility's level changes its sprite, whether the warehouse is drawn, and whether facility art has rules of its own.

## Decision

**The ground is a 16 px tileset without an outline.** A Wang tileset from PixelLab, laid out by the scene from each tile's corners. The first is `art/ground/meadow-01/`, dirt and grass.

**A facility is one sprite**, from PixelLab's `create_map_object`, on a canvas that is a whole number of 16 px tiles. The first three are the heroes hall (64×64), the job board (32×32) and the warehouse (48×48), under `art/facilities/<kind>/`.

**Every facility is drawn at one angle:** three-quarter, front wall facing down-right, a side wall showing.

**A facility's level may change its sprite**, never its canvas or its angle, so an upgrade swaps the picture in place. Only level 1 is drawn now.

**The warehouse is drawn.** Every camp has one, and the player will open it for their stock.

**Facility art has rules of its own,** `docs/process/assets.md`, rules 14 to 19, as the hero sprite set has.

## Considered and not chosen

**One painted background per camp.** One generation and a richer picture, but the buildings would be painted into it. Own facilities differ between players at one location, so the scene has to place them; and every new layout would need a new painting.

**Buildings assembled from tiles,** PixelLab's building kit of walls, floors and doorways. Built for interiors and floor plans; at 320×180 a hall of 16 px wall pieces is boxy and needs layout code. The owner left the choice to the agent.

**Head-on buildings,** as in Final Fantasy 1's towns. The head-on rolls came out flat; the angled hall was the most interesting of the first rolls, and the warehouse was rolled again to match it.

**Ground A**, the same descriptions with no transition band: lime grass and salmon dirt, brighter than the hero sets. **The job board with grass at its feet**, which clashed with the tileset's own grass. **The first hall**, drawn on its own patch of ground.

**Redrawing the head-on warehouse at an angle by image-to-image** (`create_image_pixflux` over the first head-on roll). It barely moved; a new roll with the angle in the description worked.

## Where it is described

`docs/process/assets.md`, rules 14 to 19, and rule 20 for the cost. `docs/design/game.md`, "How the game looks". Each piece's `provenance.json`, and `art/mockups/first-camp-4x.png`, the mock-up the owner chose them in.
