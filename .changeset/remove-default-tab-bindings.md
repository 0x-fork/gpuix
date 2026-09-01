---
'@gpuix/native': patch
'@gpuix/react': patch
---

Stop binding Tab and Shift+Tab to focus traversal. Both keys now reach normal element keyboard handlers and the renderer-level `onKeyDown` callback, so terminals and editors can process them without a capture prop.

Applications that want Tab traversal can call the direct GPUI wrappers from the renderer callback:

```tsx
render(<App />, {
  onKeyDown(event, renderer) {
    if (event.key !== 'tab') return
    if (event.modifiers?.shift) renderer.focusPrevious?.()
    else renderer.focusNext?.()
  },
})
```

Fixes #36
