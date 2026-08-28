---
'@gpuix/native': patch
'@gpuix/react': patch
---

Stop virtual-list selection autoscroll when the list cannot move, and match platform text-field clicks.

A drag held in the list edge band no longer rebuilds the tree every 24 ms after the list reaches its end.

Double-click in `<input>` and `<textarea>` selects the word under the pointer. Triple-click still selects the whole value. Neither click starts a drag that would collapse the selection.
