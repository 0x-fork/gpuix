---
'@gpuix/react': patch
---

Add a video-editor timeline example.

```bash
cd examples && bun --hot timeline.tsx
```

It exists to answer whether GPUIX can carry a real editing surface, so it drags clips between tracks, trims both edges with snapping, scrubs a playhead, marquee-selects, zooms under the pointer, and pans on both axes with a frozen ruler and a frozen track column. All data is mocked from a seeded generator, so every run paints the same project.

Two patterns in it are worth copying.

**React owns the scroll offset.** A native `overflow: "scroll"` grid cannot drive a frozen header: GPUI moves the grid on the wheel frame, and the `onScroll` callback that would move the ruler arrives a frame later, so the two tear apart during a fast pan. One `onScroll` listener on a non-scrolling parent keeps `scrollX` and `scrollY` in state, and all three panes translate from the same numbers. Zed does the same. A `<media-bin>` panel beside the preview stays on the native two-axis path for comparison.

**A drag needs no overlay.** Each clip and each trim handle listens for `onMouseDown`, `onMouseMove`, and `onMouseUp`, which arms GPUI's pointer capture, so a release past the window edge still ends the gesture. A full-window overlay mounted on the press cannot: capture is armed by the press, and the overlay does not exist yet.

**A pannable surface has to cull.** `<virtual-list>` is the only thing that virtualizes; a surface that owns its own offset places children absolutely, so GPUI lays out every retained child every frame. `memo` removes the React work, and only culling removes the draw. On 3,259 clips across 26 tracks, one wheel frame costs **7.7ms** culled and **92ms** with `memo` alone.

`examples/timeline.test.tsx` drives all of it through the automation API, and `examples/timeline.perf.test.tsx` times mount, pan, and drag.
