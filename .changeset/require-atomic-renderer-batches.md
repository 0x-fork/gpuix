---
'@gpuix/native': minor
'@gpuix/react': minor
---

Require custom renderers to implement one atomic `applyBatch(json)` mutation method.

The renderer no longer exposes separate `createElement`, `setStyle`, `setText`,
`setCustomProp`, or `commitMutations` calls. React collects these operations and
sends one validated batch per commit on desktop, web, and in the test renderer.

```ts
const renderer: NativeRenderer = {
  applyBatch(json) {
    return nativeTransport.applyBatch(json)
  },
}
```

Style and custom-prop values inside the batch are JSON values, not nested
JSON-encoded strings.
