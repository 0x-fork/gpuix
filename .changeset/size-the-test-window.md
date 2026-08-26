---
'@gpuix/react': minor
'@gpuix/native': minor
---

Let `createTestRoot()` size the offscreen test window.

The test renderer always opened a **1280x800** window. That is wide enough to keep a centered `maxWidth` column at its cap, so any layout that only changes below a breakpoint was invisible to the suite.

A chat transcript shows the problem. Its column is `min(720, paneWidth - 40)`, so a sidebar that animates the pane between `W` and `W - 253` only re-wraps text while `W < 1013`. At the old fixed 1280 both states resolve to 720 and the re-wrap never happens.

```tsx
// 1280 wide: column is capped at 720 whether the sidebar is open or closed
const wide = createTestRoot()

// 640 wide: the column now tracks the pane, so re-wrapping is observable
const narrow = createTestRoot({ width: 640, height: 480 })
```

Either dimension can be omitted and keeps its default:

```tsx
createTestRoot({ width: 640 }) // 640 x 800
```

A width or height that cannot be laid out is rejected instead of producing a window with no area:

```tsx
createTestRoot({ width: 0 }) // throws: must be a positive, finite number
```

`createTestRoot()` with no argument is unchanged and still opens 1280x800, so existing tests keep their geometry.
