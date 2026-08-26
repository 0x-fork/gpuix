---
'@gpuix/react': minor
---

`bun run web` now serves the browser example through Bun's frontend dev server, so an edit to a component module is a **React Fast Refresh** update instead of a full page reload.

Edit `examples/chat.tsx` and the components swap in place. `useState` survives, so the composer text, the sidebar selection and the scroll position all stay where they were. The GPUI canvas is never re-created and the ~19 MB Wasm module is never re-fetched.

Fast Refresh applies to a module whose exports are all components. Edit anything else, such as the entry file, and Bun reloads the page instead. Both paths are correct; the reload is only slower.

```bash
bun run web          # build the Wasm if it is missing, then serve with HMR
bun run web:wasm     # only cargo + wasm-bindgen
```

React Fast Refresh reaches a custom renderer through the React DevTools global hook. Bun's HMR runtime calls `injectIntoGlobalHook(window)`, and `reconciler.injectIntoDevTools()` hands that hook the `scheduleRefresh` and `setRefreshHandler` helpers it needs. `packages/react/src/__tests__/fast-refresh.test.tsx` locks this down: it mounts through the GPU test renderer, clicks to set state, swaps the component family, and asserts the new output keeps the old state.

Two rules for a browser entry, both learned the hard way:

- **Never call `import.meta.hot.accept("./your-app", ...)` in the entry file.** Bun runs an importer's dependency-accept callback even when the imported module already self-accepted for Fast Refresh. The callback then remounts on top of a successful refresh and wipes every hook, which looks exactly like Fast Refresh being broken.
- **Keep the `@gpuix/native` import out of any Refresh boundary.** The Wasm half is a singleton. `WebGpuixRenderer::init` fails with `GPUIX web is already running` once its thread-local app exists, and GPUI's browser platform appends its own canvas to `<body>`. Bun re-runs only the changed module and then walks upward through its importers, so an unchanged dependency is never re-evaluated. Living in `node_modules` is not what saves you: Bun bundles it into the same client registry as your app.

The old hand-written static file server and the generated `examples/web-dist` bundle are gone. `examples/web.html` now points at `./web-chat.tsx` directly and Bun bundles it.
