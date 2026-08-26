---
'@gpuix/native': patch
'@gpuix/react': patch
---

Keep `<virtual-list>` at the top when rows are prepended.

A list is anchored on a **row**, not a pixel offset, so inserting rows above the
viewport used to slide the viewport down by exactly the height of the new rows.
A todo list or a feed that prepends the newest item never showed it:

```tsx
const add = (title: string) =>
  setTodos((current) => [{ id: nextId(), title }, ...current])
```

Every add pushed the new row above the top edge, and the list looked frozen on
the rows that were already there.

A browser anchors the same way, and suppresses it at `scrollTop: 0`. GPUIX now
does the same: a top-aligned list that is scrolled to the very top stays at the
top across a mutation, so the prepended row is visible. Scrolled anywhere else,
the rows under the pointer still do not move.

```text
scrolled down                          pinned to the top
┌──────────────────┐                   ┌──────────────────┐
│ new row  (above) │  ◄── inserted     │ new row          │  ◄── inserted, visible
├──────────────────┤                   ├──────────────────┤
│ ░░ viewport ░░░░ │  stays put        │ ░░ viewport ░░░░ │  follows the insert
│ ░░░░░░░░░░░░░░░░ │                   │ ░░░░░░░░░░░░░░░░ │
└──────────────────┘                   └──────────────────┘
```

A history pane that loads older pages while the user reads should keep using
`alignment="bottom"`, where a page load never moves the text.

The drift was invisible while the content was shorter than the viewport, because
gpui re-anchors to row 0 on every layout in that case. It appeared the moment
the list overflowed.
