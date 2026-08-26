---
'@gpuix/native': patch
---

Fix copying text that React split across host nodes.

`shouldSetTextContent` is false, so React creates a separate host text node for every interpolated string. `<text>Hello {name}!</text>` is three painted runs of one line, and selecting across them copied them joined with newlines:

```
Hello
Tommy
!
```

Painted runs now carry the parent host element they belong to. Copy joins runs of the same parent with nothing, and only inserts a newline between separate lines, so the same selection now yields `Hello Tommy!`.

`<code>`, `<diff>` and `<markdown>` register their runs without a group, so every line stays a line even though one element painted them all.
