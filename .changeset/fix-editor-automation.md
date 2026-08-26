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

**`fill()` and `press()` threw `GPUI browser input is unavailable` in the browser.** The client looked for `input[data-gpui-input]`, but GPUI's IME conduit is a `<textarea>`; a single-line input strips newlines from an assigned value, which would desynchronise the mirror from the document. That selector could never match, so every browser keystroke through the automation API failed. It now matches on the attribute alone, exported as `IME_MIRROR_SELECTOR`, so a future tag change cannot silently break it again.

`<img>`, `<svg>`, `<anchored>`, `<diff>` and `<markdown>` still have no painted bounds. `getByText` works inside them; `getByTestId(...).click()` does not.
