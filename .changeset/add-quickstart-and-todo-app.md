---
'@gpuix/react': patch
---

Add a **Quickstart** to the README and a **todo example app** to start from.

The README described the architecture and the mutation protocol before it ever
said how to install the packages. It also never mentioned `jsxImportSource`,
which is required: without it TypeScript falls back to DOM types and
`<virtual-list>`, `<markdown>`, `<code>` and `style.hover` all fail.

```bash
bun add @gpuix/react react
bun add -d @types/react typescript
```

```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@gpuix/react" } }
```

`example-app/` is a complete todo app in one file, with scripts already wired:

| Script | What it does |
|---|---|
| `bun run dev` | Desktop app with hot remount |
| `bun run build` | Standalone binary in `dist/todo` |
| `bun run web:dev` | Browser build served with isolation headers |
| `bun run screenshot` | Drives the app through the automation client |
| `bun run typecheck` | `tsc --noEmit` |

It shows `<virtual-list>`, a native `<input>`, `motion.div`, tinted `<svg>`
icons, native `hover` and `active`, and `testId` automation hooks. Copy the
folder, change `@gpuix/react` from `workspace:^` to a version range, and run
`bun install`.
