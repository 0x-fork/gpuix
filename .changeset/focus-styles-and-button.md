---
'@gpuix/native': minor
'@gpuix/react': minor
'@gpuix/solid': minor
---

Focus is now visible by default, and there is a headless `Button`.

- `focusVisible` nested style, like `hover` and `active`. It applies after keyboard focus only, like CSS `:focus-visible`, on text fields too. GPUI applies it natively
- `outlineWidth`, `outlineColor`, `outlineOffset`: a line outside the border box that takes no layout space, so a focus ring added with `focusVisible` moves nothing. It follows `borderRadius`
- default keyboard focus look, with no ring: while a control (`Button`, a `tabIndex` div) has keyboard focus, every other focusable element renders at 40% of its opacity, so the focused one stands out and every Tab target is visible. A focused `<input>` or `<textarea>` dims nothing. The dim is independent of `focusVisible`, so an element with its own ring still dims while another control has focus. `style.keyboardFocusDim: false` keeps one element at full opacity
- `keyboardFocusDim: false` in `render()` or `createTestRoot()` turns the dim off for the whole window, so you can draw your own focus look with `focusVisible`
- keyboard focus survives small pointer jitter: an idle mouse move within 8px of where typing began keeps focus-visible styles and the dim. A larger move, a drag or a press ends them. Fixed in GPUI ([remorses/zed@ea042f2](https://github.com/remorses/zed/commit/ea042f2f04))
- `Select.Content` and `Dialog.Popup` set `keyboardFocusDim: false`; they are focused only to receive keys
- `@gpuix/solid` exports the `HostElement` type, for refs such as `initialFocus={() => field}`
- `Button` (`@gpuix/react/button`, `@gpuix/solid/button`), shaped like Base UI: a tab stop with `role="button"` that fires `onClick` on press, Enter key down (not on repeat) and Space key up. `disabled` removes it from the Tab order, `focusableWhenDisabled` keeps it. `buttonProps()` gives the same behavior to your own parts; `Dialog.Trigger` and `Dialog.Close` now use it, so Space activates them on release

```tsx
<Button onClick={save} disabled={saving}>Save</Button>
<div tabIndex={0} style={{ focusVisible: { outlineWidth: 2, outlineColor: '#89b4fa', outlineOffset: 2 } }} />
```
