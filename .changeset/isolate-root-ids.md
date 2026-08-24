---
"@gpuix/react": patch
---

Give each React root its own element ids and event handler map.

Two `createTestRoot()` trees can both start at id `1`. A click on one root no longer overwrites the other root's handlers. `resetIdCounter()` is gone.

`handleGpuixEvent` now needs the renderer that produced the event:

```ts
handleGpuixEvent(event, renderer)
```
