---
'@gpuix/native': patch
'@gpuix/react': patch
---

Keep text selection and native inputs working after Comet's later generic editor fixes.

**Selection**

- Soft-wrapped highlight and selection washes include the first glyph on the next visual row.
- A drag that starts in a virtual list keeps selecting after the anchor row unmounts.
- Dragging near a list edge scrolls the list and extends the selection into newly painted rows.

**Input and textarea**

- A double-click or triple-click selects the whole value and does not collapse if the pointer then moves.
- Dragging a textarea selection past the visible box scrolls the field.
- Adjacent typing or deletion undoes as one step for 700 ms, with a 200-step history cap.

```tsx
<textarea value={text} onChange={(event) => setText(event.value ?? "")} />
```
