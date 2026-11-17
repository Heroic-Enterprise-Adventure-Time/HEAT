---
name: capture-scene
description: Take a frame of HEAT's PixiJS canvas, the camp or a battle, out of the session's browser as a PNG file. Use when a document needs an image of the game, when art has to be judged at the pixel, or when asked for a screenshot, a frame or a contact sheet of the scene or of a battle.
---

# Capture the scene

Follow `docs/runbooks/capture-scene.md`, step by step; it starts from the dev server of `docs/runbooks/dev-server.md`. What this file adds is only how the desktop app's tools map onto the runbook:

- The session's browser is brought on screen with `mcp__ccd_view__show_pane`, `preview`, before anything is captured; if it answers that the session is not open in any window, ask the owner to open it and stop there.
- The capture runs in the page with `mcp__Claude_Browser__javascript_tool`. `mcp__Claude_Browser__computer` with `screenshot` saves a JPEG and is not the capture.
- The receiver is written with the Write tool to the scratchpad and run by path with `node` in the background.
