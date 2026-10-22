---
name: hero-sprite-set
description: Make one of HEAT's hero sprite sets with PixelLab, from an appearance and a class to committed files under art/heroes/ with their provenance. Use when asked to make, add, re-roll or animate a hero sprite set, a new look for a hero class, or a monster's sprite set under art/monsters/.
---

# Hero sprite set

Follow `docs/runbooks/hero-sprite-set.md`, step by step. Its rules come from `docs/process/assets.md`, rules 5 to 13, and 28 and 29 for a monster; read both before the first call.

- The PixelLab tools are the owner's claude.ai connector (assets.md, rule 2). If they are missing, ask the owner; nothing else generates HEAT's art.
- Show candidates and animations to the owner in the session's browser, served from the scratchpad (`python -I -m http.server 8765`); the owner keeps or rejects, the agent never does.
- The agent queues the animations and checks them; the owner reviews them and re-rolls any direction on PixelLab's website. The agent never re-rolls or deletes an animation.
- `scripts/hero-sprite-set.mjs` writes and checks the files and the provenance; its report decides nothing on its own.
