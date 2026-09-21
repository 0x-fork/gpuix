---
'@gpuix/native': patch
'@gpuix/react': patch
---

Split the shared host renderer contract so helpers ask only for the methods they use.

`createMutationQueue` now takes a `MutationHost` (`applyBatch` only). Window size, insets, and selection use `WindowSizeHost`, `WindowInsetsHost`, and `SelectionHost`. `NativeRenderer` is still the adapter-facing type: required `applyBatch`, plus the live renderer methods as optional.

Host types that napi already owns (`ElementBounds`, `HighlightMatch`, `PathPromptOptions`, overlay stats) are re-exported from the generated addon types instead of copied in `@gpuix/native/host`.
