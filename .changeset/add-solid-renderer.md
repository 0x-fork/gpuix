---
'@gpuix/native': minor
'@gpuix/react': minor
'@gpuix/solid': minor
---

Add the official Solid 1 renderer and move the framework-neutral JavaScript
runtime into `@gpuix/native`.

Solid applications run through normal Bun commands with a preload:

```toml
preload = ["@gpuix/solid/preload"]
```

```tsx
import { createSignal } from 'solid-js'
import { render } from '@gpuix/solid'

const [count, setCount] = createSignal(0)

render(() => (
  <div onClick={() => setCount((value) => value + 1)}>
    <text>Count: {count()}</text>
  </div>
))
```

The package includes native motion, Select, Combobox, Tooltip, shared testing
and automation, Solid JSX declarations, `@gpuix/solid/preload`, and
`@gpuix/solid/bun-plugin` for production `Bun.build` calls.

Framework-neutral APIs are now available from `@gpuix/native/host`,
`@gpuix/native/testing`, and `@gpuix/native/automation`. React keeps its current
public imports as adapters and re-exports. The native package now exposes an ESM
loader by default; its explicit CommonJS condition remains for the documented
Hermes runtime.
