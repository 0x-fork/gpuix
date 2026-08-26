---
'@gpuix/native': patch
'@gpuix/react': patch
---

Fix automation against `<input>` and `<textarea>`. Both were unreachable through the locator API.

```ts
await app.getByTestId('composer').click()
await app.getByTestId('composer').fill('hello gpuix')
```

**`bounds()` and `click()` threw `Element has no painted bounds`.** Custom elements paint themselves, so nothing registers their box unless their builder attaches the automation bounds tracker. `<div>` and `<text>` get it from `build_element`, and `<code>` attached its own, but the editor did not. The only workaround was a hard-coded pixel coordinate, which breaks the moment the layout moves.

**`fill()` and `press()` threw `GPUI browser input is unavailable` in the browser.** A GPUI web page has two event surfaces: the `<canvas>` takes pointer events, and a hidden `[data-gpui-input]` element appended to `<body>` takes every keyboard and IME event. Dispatching a synthetic `KeyboardEvent` at that element is the only way to type into a browser app.

The client looked for `input[data-gpui-input]`. That element was an `<input>` until [zed-industries/zed#63201](https://github.com/zed-industries/zed/pull/63201) replaced it with a `<textarea>`, because a single-line input strips newlines from an assigned value and desynchronises the mirror from the document. The selector was never updated, so after that GPUI bump it could never match and every browser keystroke failed. It now matches on the attribute alone, exported as `IME_MIRROR_SELECTOR`, and the error names the selector it looked for.

`<img>`, `<svg>`, `<anchored>`, `<diff>` and `<markdown>` still have no painted bounds. `getByText` works inside them; `getByTestId(...).click()` does not.
