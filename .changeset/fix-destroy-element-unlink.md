---
'@gpuix/native': patch
---

Fix `destroyElement` leaving a dangling child id on the parent, and not invalidating the parent chain.

`destroyElement` removed the element and its descendants but never unlinked it from its parent's `children`, and never called `mark_changed`. React normally sends `removeChild` first, so this was hidden in practice, but the `destroyElement` and `applyBatch` APIs both allow a direct destroy.

It now unlinks first, then destroys, then bumps `subtree_revision` up the ancestor chain, so any cache keyed on that revision cannot keep serving text that is no longer in the tree.
