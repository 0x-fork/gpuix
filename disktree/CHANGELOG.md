# disktree

## 0.2.0

1. **Runs on plain Node** — Bun is no longer required:

   ```bash
   npx disktree ~/src
   ```

   The package ships compiled JavaScript and needs Node 20 or later. `bunx disktree` still works.

2. **iCloud folders are scanned like any other folder** — the Bun-only check that skipped evicted iCloud folders is gone.
