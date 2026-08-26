---
'@gpuix/react': patch
---

Fix `key` on every GPUIX element. A list built with `.map()` failed to
typecheck before this change, so any real app broke on the first `tsc` run:

```
error TS2322: Type '{ key: string; ... }' is not assignable to type 'Props'.
  Property 'key' does not exist on type 'Props'.
```

`key` now lives on `Props` and on `<virtual-list>`, next to `ref`. It cannot
live on `JSX.IntrinsicAttributes`, because TypeScript 5 ignores that member for
intrinsic elements. React's DOM types work only because `DetailedHTMLProps`
already carries `key`.

```tsx
{todos.map((todo) => (
  <div key={todo.id}>
    <text style={{ color: '#e2e2e2' }}>{todo.title}</text>
  </div>
))}
```

Every element prop type extends `Props`, so `<div>`, `<text>`, `<img>`, `<svg>`,
`<canvas>`, `<input>`, `<textarea>`, `<anchored>`, `<code>`, `<diff>`,
`<markdown>` and `<virtual-list>` all accept `key` again. So do `motion.div`,
`VirtualList`, Select, Combobox and Tooltip.

Also fix `@gpuix/react/jsx-dev-runtime` types. They re-exported `jsx` and `jsxs`
from `react/jsx-dev-runtime`, which exports only `jsxDEV`. The declarations now
match the runtime file.
