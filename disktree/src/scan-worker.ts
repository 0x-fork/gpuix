/**
 * One scan worker for disktree. The main thread hands it directories; it walks
 * them depth first with synchronous syscalls, which are several times cheaper
 * than one promise per entry, and returns a compact record per directory.
 *
 * After BUDGET directories it stops and hands the unvisited frontier back, so
 * the main thread can spread a deep tree like `/Users` across every worker.
 *
 * Self-contained on purpose: Node 24 loads this file with type stripping
 * (under vitest), Bun loads it natively, and neither sees the app's modules.
 */

import { lstatSync, readdirSync, type Stats } from 'node:fs'
import path from 'node:path'
import { parentPort } from 'node:worker_threads'

export interface ScanRequest {
  paths: string[]
  includeHidden: boolean
  devices: number[]
  skip: string[]
}

/** name, disk bytes, apparent bytes, mtime ms, hardlink key or '' */
export type FileRecord = [string, number, number, number, string]

export interface DirRecord {
  path: string
  modified: number
  unreadable: boolean
  /** The largest files, one node each. */
  files: FileRecord[]
  /** Everything else, folded into one total. */
  folded: { count: number; bytes: number; apparent: number; modified: number; links: FileRecord[] } | null
  /** Subdirectories to be scanned; their records follow here or in a later batch. */
  dirs: string[]
  /** Subdirectories that are only in the cloud: shown, never listed. */
  cloud: string[]
}

export interface ScanReply {
  records: DirRecord[]
  pending: string[]
  errors: number
}

const BUDGET = 400
/** Files kept as their own tile per directory; the rest cannot be seen anyway. */
export const KEEP_FILES = 12

// `SF_DATALESS` from <sys/stat.h>: an iCloud or File Provider folder macOS has
// evicted. Listing it makes macOS fetch its entries from the server, so the
// Rust original checks this flag and does not descend. `fs.Stats` has no
// `st_flags`, so it is read with one raw `lstat` per directory.
// TODO: drop bun:ffi if fs.Stats ever exposes libuv's st_flags. https://nodejs.org/api/fs.html#class-fsstats
const SF_DATALESS = 0x4000_0000
type FlagsOf = (full: string) => number
async function loadFlags(): Promise<FlagsOf | null> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64' || !process.versions.bun) return null
  const { dlopen, FFIType, ptr } = await import('bun:ffi')
  const libc = dlopen('/usr/lib/libSystem.B.dylib', {
    lstat: { args: [FFIType.cstring, FFIType.ptr], returns: FFIType.i32 },
  })
  // arm64 `struct stat` is 144 bytes, `st_flags` a u32 at offset 116.
  const buffer = new Uint8Array(144)
  const view = new DataView(buffer.buffer)
  const pointer = ptr(buffer)
  return (full) => (libc.symbols.lstat(Buffer.from(`${full}\0`), pointer) === 0 ? view.getUint32(116, true) : 0)
}
const flagsOf = await loadFlags()

function scanBatch(request: ScanRequest): ScanReply {
  const devices = new Set(request.devices)
  const skip = new Set(request.skip)
  const records: DirRecord[] = []
  const stack = [...request.paths].reverse()
  let errors = 0

  while (stack.length && records.length < BUDGET) {
    const full = stack.pop()!
    const record: DirRecord = { path: full, modified: 0, unreadable: false, files: [], folded: null, dirs: [], cloud: [] }
    records.push(record)
    let names: string[]
    try {
      record.modified = lstatSync(full).mtimeMs
      names = readdirSync(full)
    } catch {
      record.unreadable = true
      errors++
      continue
    }
    const files: FileRecord[] = []
    const subdirs: string[] = []
    for (const name of names) {
      if (!request.includeHidden && name.startsWith('.')) continue
      const child = path.join(full, name)
      if (skip.has(child)) continue
      let stat: Stats
      try {
        stat = lstatSync(child)
      } catch {
        errors++
        continue
      }
      if (stat.isDirectory()) {
        // One volume, like `du -x`: other mounts are other disks.
        if (!devices.has(stat.dev)) continue
        if (flagsOf && flagsOf(child) & SF_DATALESS) record.cloud.push(name)
        else subdirs.push(name)
        continue
      }
      const link = stat.nlink > 1 ? `${stat.dev}:${stat.ino}` : ''
      files.push([name, stat.blocks * 512, stat.size, stat.mtimeMs, link])
    }
    files.sort((left, right) => right[1] - left[1])
    record.files = files.slice(0, KEEP_FILES)
    const rest = files.slice(KEEP_FILES)
    if (rest.length) {
      record.folded = { count: rest.length, bytes: 0, apparent: 0, modified: 0, links: [] }
      for (const file of rest) {
        record.folded.bytes += file[1]
        record.folded.apparent += file[2]
        record.folded.modified = Math.max(record.folded.modified, file[3])
        if (file[4]) record.folded.links.push(file)
      }
    }
    record.dirs = subdirs
    for (let index = subdirs.length - 1; index >= 0; index--) stack.push(path.join(full, subdirs[index]!))
  }
  return { records, pending: stack.reverse(), errors }
}

parentPort?.on('message', (request: ScanRequest) => parentPort!.postMessage(scanBatch(request)))
