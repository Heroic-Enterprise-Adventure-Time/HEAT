# Capturing the scene as an image

How a frame of the PixiJS canvas, the camp or a battle, is taken out of the session's browser as a PNG file, for a document's image or to judge art at the pixel. The image's own rule is `docs/README.md`, rule 12: it says what it shows and when. The Claude Code skill `.claude/skills/capture-scene/` points here.

## Rules

1. **From the dev server, not the stack's URL.** The capture leaves the page by a request to a port on the laptop, and an `https` page cannot reach one from the session's browser: the request is refused as mixed content, and writing to the clipboard is denied. The page is `http://localhost:4200`, served by `docs/runbooks/dev-server.md`, which is the same stack's client.
2. **The session is on screen** for the whole capture (`docs/process/sessions.md`, rule 13). An adventure is not started on a hidden page: it would not advance.
3. **The frame is read inside `requestAnimationFrame`.** `canvas.toDataURL()` called from anywhere else returns a blank image, because the WebGL buffer is cleared once the frame is composited; inside the callback it runs after PixiJS has drawn the same frame. The call is raced with a timeout, so a hidden pane fails loudly instead of waiting for ever. The browser tool's own screenshot is a JPEG of the pane and is not a substitute.
4. **A receiver on the laptop writes the file.** A small Node HTTP server on `127.0.0.1`, written to the scratchpad and run by path, takes the data URL in a `POST` and writes the PNG into the scratchpad under the name the request gives. It answers with `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Private-Network: true`, without which the page's request is refused. It is stopped when the capture is done.
5. **A battle is captured from its replay.** A live fight is over in seconds, too fast to pause by asking. Play the job, then open "Watch the replay", which is the same scene at the same speeds, and capture on an interval, every 1.5 seconds for about 90 seconds; the hero's health line is the only sign of where the fight stands, because the replay shows no stage text. A job that outlasts a reload, "Timber from the near woods", is the one to use where the capture has to resume.
6. **Choose from a contact sheet, crop without resampling.** The frames are tiled into one sheet, one is picked, and the crop copies pixels: in PowerShell, `System.Drawing` with `Bitmap.Clone(Rectangle)` for a crop, and `InterpolationMode.NearestNeighbor` with `PixelOffsetMode.Half` for a whole-number enlargement.
7. **The image carries its source.** Its alt text, or a note beside the file, names the stack or commit it was captured from (`docs/README.md`, rule 12).

## Why

Each rule is the way that did not work first: the blank `toDataURL` and the JPEG screenshot on Issue-177, the `https` page that could not reach the receiver on the same issue, the fight that ended between two polls on Issue-180, and a battle that never advanced on Issue-286 because the session was not open in a window. Pixel art resampled by a smoothing filter is no longer the art, which is why the crop and the enlargement are spelled out.
