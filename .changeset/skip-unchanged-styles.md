---
'@gpuix/react': patch
'@gpuix/native': patch
---

Skip unchanged style updates and intern shared style objects.

A later React commit no longer sends `setStyle` when the style object is the same reference, or when a new object has the same fields. Shared style constants are sent once as `internStyle` and then attached with `setStyleId`.

```tsx
const ROW = { display: 'flex', height: 40 }

// 20 rows share one interned style in Rust
{items.map((item) => (
  <div key={item.id} style={ROW}>{item.label}</div>
))}
```

This cuts batch size and retained copies for long lists that reuse style objects. Mutating a style object in place without creating a new object is not supported.
