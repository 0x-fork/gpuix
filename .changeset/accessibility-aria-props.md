---
'@gpuix/native': minor
'@gpuix/react': minor
---

Expose GPUI accessibility through React `role` and `aria-*` props.

A node is in the platform accessibility tree only with both a GPUI id (already set) and a role. VoiceOver, Accessibility Inspector, and other AX clients can now see labelled controls instead of an empty window.

```tsx
<div
  role="button"
  aria-label="Delete note"
  aria-id="notes.delete"
  onClick={remove}
>
  Delete
</div>
```

- Prop names match React DOM: `aria-label`, not `ariaLabel`
- Role values are ARIA tokens (`"button"`, `"heading"`). `"none"` / `"presentation"` produce no node
- `<text>` defaults to `Label`, `<input>` to `TextInput`, `<textarea>` to `MultilineTextInput`, `<img>` to `Image` with `alt`
- `onClick` registers AccessKit Click, so VoiceOver Press fires the same JS handler
- Browser / wasm has no AccessKit adapter; these props are no-ops there

Fixes #47
