#!/usr/bin/env bun
/** @jsxImportSource @gpuix/react */
/**
 * disktree [dir]: scan `dir`, or the directory it runs from, and open the window.
 *
 * `bun --hot` re-runs this file on save. The store is kept on globalThis so a
 * save remounts the view on the finished tree instead of starting a second
 * full scan beside the first.
 */

import path from 'node:path'
import { render } from '@gpuix/react'

import { DisktreeApp, createDisktreeStore, type DisktreeStore } from './app.tsx'

const root = path.resolve(process.argv[2] ?? process.cwd())
const global = globalThis as { __disktreeStore?: DisktreeStore }
let store = global.__disktreeStore
if (!store || store.get().root !== root) {
  store = createDisktreeStore(root)
  global.__disktreeStore = store
  void store.rescan()
}

render(<DisktreeApp store={store} />, {
  title: 'disktree',
  appName: 'disktree',
  width: 1320,
  height: 840,
  minWidth: 1100,
  minHeight: 600,
  titlebarTransparent: true,
  windowBackground: 'blurred',
  trafficLightX: 18,
  trafficLightY: 20,
  // Agent checks need real GPU paint, not the user's keyboard.
  focus: process.env.GPUIX_BACKGROUND !== '1',
})
