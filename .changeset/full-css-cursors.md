---
'@gpuix/native': minor
'@gpuix/react': minor
---

Support every CSS `cursor` keyword GPUI can paint, not just `pointer` and `default`.

Resize and drag cursors are what tell a user that an edge can be trimmed or a clip can be grabbed. Until now `col-resize` was silently dropped.

```tsx
<div style={{ cursor: 'grab', active: { cursor: 'grabbing' } }} />
<div style={{ cursor: 'col-resize' }} />
```

| Group | Keywords |
|---|---|
| Pointing | `default`, `auto`, `pointer`, `context-menu`, `not-allowed`, `no-drop` |
| Text | `text`, `vertical-text`, `crosshair` |
| Dragging | `grab`, `grabbing`, `move`, `all-scroll`, `alias`, `copy` |
| Resizing | `col-resize`, `row-resize`, `ew-resize`, `ns-resize`, `nwse-resize`, `nesw-resize`, `n-resize`, `e-resize`, `s-resize`, `w-resize`, `ne-resize`, `nw-resize`, `se-resize`, `sw-resize` |

`cursor` is now a typed union in `StyleDesc`, so an editor completes the list. An unlisted keyword is ignored, like any other invalid style value.
