---
'@gpuix/native': minor
'@gpuix/react': minor
---

Let the wheel reach an ancestor scroller from under an absolutely positioned child, like a browser does.

Absolute and fixed boxes used **BlockMouse**, which ended the hit test. That made a pannable canvas impossible: a timeline clip, a graph node, or any absolutely placed item swallowed the gesture before the ancestor's pan listener ran. Now every filled or positioned `div` uses **BlockMouseExceptScroll**, so clicks and hovers still stop but the wheel passes through.

```tsx
<div style={{ position: 'relative' }} onScroll={pan}>
  {/* the wheel over this clip now pans the surface behind it */}
  <div style={{ position: 'absolute', left: 240, width: 120, backgroundColor: '#38455C' }} />
</div>
```

Set **`pointerEvents: "auto"`** on the rare element that must swallow the wheel too, such as a modal backdrop. `<anchored>` occludes by default through its own `occlude` prop, so menus and tooltips are unchanged.

An absolutely positioned box still takes clicks even with no background, exactly like an empty positioned `div` in a browser. A wrapper that only carries a scroll offset should set `pointerEvents: "none"`.
