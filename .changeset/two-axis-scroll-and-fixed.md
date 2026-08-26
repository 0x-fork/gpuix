---
'@gpuix/native': patch
'@gpuix/react': patch
---

Scroll both axes from one diagonal gesture, and lay out `position: "fixed"`.

`overflow: "scroll"` moved only one axis per wheel event, because GPUI zeroes the smaller of the two deltas by default. A browser moves both, and a two-axis container is exactly where a user expects that.

```tsx
<div style={{ width: 260, height: 220, overflow: 'scroll' }}>
  {/* one diagonal swipe now pans on X and Y together */}
</div>
```

A flex column stretches its children to the cross axis, so rows in a two-axis container still need to state a width, or there is nothing to pan on X.

`position: "fixed"` blocked hits like `absolute` but stayed in normal flow, so a box drifted when its siblings changed. It now lays out like `absolute`; Taffy has no viewport-fixed mode and GPUI has no scrolling document to be fixed against.
