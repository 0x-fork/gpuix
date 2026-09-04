---
'@gpuix/react': patch
---

Show a stack overlay after a JavaScript runtime error, with a Reload button.

A throw used to keep the window alive but empty. `render()` now paints the
error message and stack, and **Reload** remounts the last tree.

```tsx
render(<App />)
```

Unhandled React render errors, `uncaughtException`, and `unhandledRejection`
all take this path. Save under `bun --hot` still remounts too.
