---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add a `highlight` prop that paints a background wash behind matched or explicitly given text ranges. This is what you need to build Ctrl+F, mark agent citations, or tint LSP diagnostic ranges.

Put it on any element and it applies to that element's subtree, so the root searches the window and a container searches only that container.

```tsx
<div highlight={{ query: 'fox' }}>
  <text>the quick brown fox</text>
</div>
```

It reaches `<text>`, `<code>`, `<markdown>` and `<diff>` with no extra props, because every string GPUIX paints goes through the same funnel.

**A find bar.** `useTextSearch` owns the cursor and the count. `next` and `previous` are plain event handlers, so nothing needs an effect.

```tsx
import { useTextSearch } from '@gpuix/react'

const search = useTextSearch({ query })

<text>{search.total === 0 ? 'No results' : `${search.active + 1}/${search.total}`}</text>
<div onClick={search.previous}><text>↑</text></div>
<div onClick={search.next}><text>↓</text></div>

<div {...search.props} style={{ flex: 1 }}>
  <Transcript />
</div>
```

**Explicit ranges** when you already have offsets. They are `[start, end)` in UTF-16 code units, the units `indexOf` and `RegExp.exec` return. A pair that splits a surrogate pair is rejected, never silently snapped.

```tsx
<div highlight={{ ranges: [[6, 11]], color: '#f43f5e55' }}>
  <text>Hello {name}!</text>
</div>
```

| field | meaning |
|---|---|
| `query` | substring to match, case-insensitive by default |
| `caseSensitive` | exact case only |
| `wholeWord` | neither neighbour may be alphanumeric or `_` |
| `ranges` | explicit `[start, end)` UTF-16 pairs |
| `color` / `activeColor` | any CSS colour; defaults come from the theme |
| `activeIndex` | which match gets `activeColor`, for a find cursor |
| `radius` | corner radius of the wash, default 2 |

Pass an array to paint several at once. Later entries draw on top.

**Matching rules.** Matches are non-overlapping and leftmost-first. A match never crosses a line, exactly like browser find. It does cross the several host nodes React creates for one interpolated line, which matters more than it sounds: `<text>Hello {name}!</text>` is three separate host text nodes, and `Hello Tommy` still matches. The nearest declaration wins, so a nested `highlight` replaces its ancestor's for that subtree.

**Counting in a virtual list.** `<virtual-list>` never builds off-screen rows, so native cannot count or scroll to a match that was never painted. `onHighlight` counts retained text only. The new `findRanges` export is the same matcher in JS, so you can count your own row data without the two ever disagreeing:

```tsx
import { findRanges, useTextSearch } from '@gpuix/react'

const hits = useMemo(
  () =>
    rows.flatMap((row, i) =>
      findRanges({ text: row.text, query }).length > 0 ? [i] : [],
    ),
  [rows, query],
)
const search = useTextSearch({ query, total: hits.length })
listRef.current.scrollToItem(hits[search.active])
```

**Testing.** A highlight is a quad, so `getPaintedText()` cannot see it. The new `renderer.getPaintedHighlights()` reports the matched range in UTF-16 units plus the boxes it drew, one per visual row:

```ts
const [hit] = renderer.getPaintedHighlights()
expect(hit.text.slice(hit.start, hit.end)).toBe('quick')
expect(hit.rects).toHaveLength(1)
```

**Performance.** The prop is the opt-in: nothing resolves and nothing paints unless an element declares one. When a query is active, the subtree's group list is cached on a dedicated text revision that a query change does not move, while the located matches are cached on a matcher hash that excludes `activeIndex` and the colours. So a keystroke never re-walks or re-folds text, and moving the find cursor only re-colours matches it already found. A root-scoped query over a 1000-turn chat costs about 2ms per keystroke.

**Matching contract.** Unicode default lowercasing, not full case folding, so `ﬀ` does not match `ff`. A word boundary is any code point that is not a letter, a digit, or `_`. Both the native matcher and `findRanges` follow the same rules.
