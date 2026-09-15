---
'@gpuix/native': minor
'@gpuix/react': minor
---

Add a window-level `onSelectionChange` callback so React apps can react when the text selection changes.

Pass it to `render()` or `createRoot()`, the same way as `onKeyDown`. The payload is a normal `EventPayload`. `value` is the joined selected text, or omitted when the selection is empty.

```tsx
render(<App />, {
  onSelectionChange(event) {
    setCopied(event.value ?? '')
  },
})
```

The event fires once per real change, including a clear. An unchanged frame does not fire.
