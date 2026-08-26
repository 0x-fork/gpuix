---
'@gpuix/example-app': patch
---

Add a Vitest suite to the starter app and `testId` props to every task row.

`example-app/app.test.tsx` mounts `TodoApp` on the GPU test renderer and drives
it with the same locator API as `screenshot.ts`, without a child process:

```tsx
const { render, renderer } = createTestRoot({ width: 940, height: 660 })
render(<TodoApp />)
const app = await connectTest(renderer)

await app.getByTestId('view-inbox').click()
await app.getByTestId('row-t5').hover()
await app.getByTestId('delete-t5').click()
expect(renderer.getPaintedText()).not.toContain('Animate the sidebar with motion.div')
```

`render()` at the bottom of `app.tsx` now sits behind an entry-point check, so
importing the file does not open a window.

Rows carry `row-<id>`, `toggle-<id>`, `star-<id>` and `delete-<id>`. The trash
button only exists while the row is hovered, so `hover()` comes first.
