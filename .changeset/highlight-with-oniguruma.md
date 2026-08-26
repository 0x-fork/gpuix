---
'@gpuix/native': patch
---

Use **Oniguruma** instead of fancy-regex for Syntect highlighting on native builds. A chat that shows one small TypeScript fence used to lose about **130ms on its first frame**.

Syntect compiles every TextMate regex of a grammar the first time that grammar is used. That work runs on the frame thread, inside a paint. The engine decides how expensive it is:

| grammar | fancy-regex, first use | **Oniguruma, first use** |
| --- | ---: | ---: |
| TypeScript | ~133ms | **~12ms** |
| Markdown | ~39ms | **~1.7ms** |
| Rust | ~17ms | **~1.6ms** |

Later highlights of the same grammar were always sub-millisecond, so this only ever hit the first `<code>`, `<diff>`, or Markdown fence of each language. It looked like a slow mount, or a single dropped frame while scrolling onto a code block.

The chat example mount for 1000 turns goes from about **240ms to about 130ms**, and the worst scroll frame from about **17ms to about 6ms**.

The browser Wasm build keeps the pure-Rust fancy-regex engine, because Oniguruma is a C library. The two engines are selected by target, and nothing in the public API changes:

```tsx
<code code={source} language="typescript" />
```

Token colours, `HighlightKind`, language detection, and the JS theme overrides are all unchanged.
