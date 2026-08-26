---
'@gpuix/native': patch
---

Fix reversed diagonal resize cursors in the browser build.

`nwse-resize` painted the north-east/south-west arrow on the web and the north-west/south-east arrow everywhere else, so a corner grip pointed the wrong way in exactly one target.

The bug was in GPUI itself: `gpui_web` mapped `CursorStyle::ResizeUpLeftDownRight` to `nesw-resize`, while macOS, Windows, X11, and Wayland all map it to the north-west/south-east cursor. The two doc comments in `gpui/src/platform.rs` named the same reversed values, which is where the web mapping came from. Both are corrected in the pinned fork, and the submodule moves with this release.
