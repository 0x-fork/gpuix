---
'@gpuix/cli': minor
---

Add `gpuix new` to create a standalone project from the official GPUIX example app.

```bash
bunx @gpuix/cli new my-app
cd my-app
bun run dev
```

The command downloads only `example-app/`, replaces its workspace dependency
with the latest published `@gpuix/react` version, and installs the project.
