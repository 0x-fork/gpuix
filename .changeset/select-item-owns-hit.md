---
'@gpuix/react': patch
---

Add `asChild` to `SelectItem` and `ComboboxItem` for custom painted rows.

GPUI has no bubbling. A nested row with a background can sit on top of its item
and swallow the press. With `asChild`, the row becomes the item itself, so native
hover, event ids, disabled state, selection, and popup close behavior stay on one
hit target.

```tsx
<SelectItem value="opus" asChild>
  <MenuRow>Claude Opus 4.6</MenuRow>
</SelectItem>
```

The child must forward its ref and host props.
