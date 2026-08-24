---
'@gpuix/native': minor
'@gpuix/react': minor
---

Render React GPUIX apps through GPUI's browser platform with WebGPU and a WebGL2 fallback.

```sh
bun run web
```

The browser build exposes the same mutation interface to React and reuses `RetainedTree`, `GpuixView`, styles, and text painting. napi-rs remains the desktop bridge; wasm-bindgen starts `gpui_web` in the browser. Raw SVG sources render through GPUI's monochrome icon pipeline. Tree-sitter C grammars stay disabled on wasm, so native document elements paint plain text on this target. Browser event callbacks are not supported yet.
