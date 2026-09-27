# disktree

**See what fills your disk.** A GPU-rendered treemap of any folder, built with
[GPUIX](https://github.com/remorses/gpuix). A light, frosted port of
[tobi/disktree](https://github.com/tobi/disktree).

![disktree scanning a website project](https://raw.githubusercontent.com/remorses/gpuix/main/disktree/screenshot.png)

```bash
bunx disktree            # scan the current directory
bunx disktree ~/src      # or any folder
bunx disktree /          # the whole disk
```

Needs [Bun](https://bun.sh). No Electron, no web view: GPUI paints it with Metal.

## What it shows

- **Tiles** sized by disk usage (`st_blocks × 512`), coloured by kind: code,
  agent scratch, toolchains, synced, git, media, documents, cache
- **Hatched tiles** are reclaimable: caches, build output, `node_modules`
  beside a `package.json`, trash
- **Worth a look** ranks the largest things that could go
- **Disk** shows free space on the volume

## Keys

| Input | Action |
|---|---|
| click a folder | open it |
| click a file | select it |
| `⌫`, `Esc`, back button | up one level |
| `[` `]` | change depth |
| `t` | Size, Files, Age |
| `r` | scan again |

## How it scans

A pool of up to four worker threads walks the tree with synchronous `lstat`, one volume
only, hardlinks counted once. Each directory keeps its 12 largest files as
tiles and folds the rest into one "N smaller files" tile, which keeps a
full-disk scan in memory.

`/System/Volumes/Data` is skipped when scanning `/`, since it mirrors `/Users`
and `/Applications`.
