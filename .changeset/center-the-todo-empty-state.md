---
'@gpuix/example-app': patch
---

Centre the starter app's empty state and stop drawing the star twice.

`EmptyState` used to be the single child of the `<virtual-list>`, so it could
only pad itself down from the top: a list row is sized to its content and never
fills the viewport. It is now rendered **in place of** the list, as a
`flexGrow: 1` box that centres on both axes.

```tsx
{visible.length === 0 ? (
  <EmptyState view={view} />
) : (
  <virtual-list estimatedItemHeight={48}>…</virtual-list>
)}
```

A starred row also painted a static star next to the hover strip, which already
carries a star button tinted with the accent. The static marker now steps aside
while the row is hovered.
