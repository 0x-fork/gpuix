---
'@gpuix/native': minor
'@gpuix/react': minor
---

Let `<virtual-list>` mount a window of React rows instead of all of them.

The children form retains every child, so the first mount of a long transcript pays for every row. Pass `itemCount` with `estimatedItemHeight` and `windowStart`, then render only that slice. Native keeps the full logical length for the scrollbar.

```tsx
const WINDOW = 40

function Transcript({ turns }: { turns: Turn[] }) {
  const [start, setStart] = useState(0)
  const end = Math.min(turns.length, start + WINDOW)
  return (
    <virtual-list
      itemCount={turns.length}
      windowStart={start}
      estimatedItemHeight={220}
      onVisibleRange={(event) =>
        setStart(Math.max(0, Math.floor(event.startIndex ?? 0) - WINDOW / 4))
      }
    >
      {turns.slice(start, end).map((turn) => (
        <ChatTurn key={turn.id} turn={turn} />
      ))}
    </virtual-list>
  )
}
```

`onVisibleRange` reports `startIndex` and `endIndex` after a scroll. Native ignores `itemCount` when `estimatedItemHeight` is missing, so a jump cannot collapse unmounted rows to height 0.

There is deliberately **no `VirtualList` wrapper component**. The window is application state. A generic wrapper cannot know when to widen its own window, so it silently dropped rows whenever `itemCount` grew without a scroll, which is exactly what a filter does.
