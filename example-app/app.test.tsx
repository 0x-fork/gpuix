/**
 * Drives the todo app through the GPU test renderer.
 *
 * The app is imported, not launched, so `render()` at the bottom of `app.tsx`
 * is guarded by an entry-point check. `connectTest` gives the same locator API
 * as `launch()` in `screenshot.ts`, without a child process.
 *
 *   bun run test
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import { connectTest } from '@gpuix/react/automation'
import { createTestRoot, hasNativeTestRenderer } from '@gpuix/react/testing'

import { TodoApp } from './app'

const describeNative = hasNativeTestRenderer ? describe : describe.skip

// `getPaintedText()` returns every string painted last frame, chrome included.
// The task titles are the only strings that carry a space and no digit.
function rowTitles(painted: string[]): string[] {
  const chrome = new Set(['Tasks', 'Inbox', 'Today', 'Starred', 'Done', 'Settings', 'Add'])
  return painted.filter((line) => !chrome.has(line) && !/^\d+$/.test(line))
}

describeNative('todo app', () => {
  it('paints every row of the active view', async () => {
    const { render, renderer } = createTestRoot()
    render(<TodoApp />)
    const app = await connectTest(renderer)

    // The app opens on Today: t3 and t4 are the two undone today tasks.
    expect(rowTitles(renderer.getPaintedText())).toMatchInlineSnapshot(`
      [
        "Wire a native <input> to React state",
        "Put a long list behind <virtual-list>",
        "Add a task",
      ]
    `)

    await app.getByTestId('view-inbox').click()
    expect(rowTitles(renderer.getPaintedText())).toMatchInlineSnapshot(`
      [
        "Wire a native <input> to React state",
        "Put a long list behind <virtual-list>",
        "Animate the sidebar with motion.div",
        "Tint an icon through style.color",
        "Compile a standalone binary",
        "Ship it",
        "Add a task",
      ]
    `)

    await app.close()
  })

  it('deletes the hovered row', async () => {
    const { render, renderer } = createTestRoot()
    render(<TodoApp />)
    const app = await connectTest(renderer)

    await app.getByTestId('view-inbox').click()
    // The trash button only mounts while the row is hovered.
    await app.getByTestId('row-t5').hover()
    await app.getByTestId('delete-t5').click()

    expect(rowTitles(renderer.getPaintedText())).toMatchInlineSnapshot(`
      [
        "Wire a native <input> to React state",
        "Put a long list behind <virtual-list>",
        "Tint an icon through style.color",
        "Compile a standalone binary",
        "Ship it",
        "Add a task",
      ]
    `)

    await app.close()
  })

  it('adds a task through the composer', async () => {
    const { render, renderer } = createTestRoot()
    render(<TodoApp />)
    const app = await connectTest(renderer)

    await app.getByTestId('composer').fill('Write a test')
    await app.getByTestId('add').click()

    expect(rowTitles(renderer.getPaintedText())).toMatchInlineSnapshot(`
      [
        "Write a test",
        "Wire a native <input> to React state",
        "Put a long list behind <virtual-list>",
        "Add a task",
      ]
    `)

    await app.close()
  })

  it('keeps a new task in view once the list is taller than the viewport', async () => {
    const { render, renderer } = createTestRoot({ width: 940, height: 660 })
    render(<TodoApp />)
    const app = await connectTest(renderer)

    // `add` prepends. gpui anchors a list on a logical item, so without the
    // pinned-to-top rule the viewport slid down one row per add and the new
    // task was painted above the top edge.
    for (let index = 1; index <= 20; index += 1) {
      await app.getByTestId('composer').fill(`task ${index}`)
      await app.getByTestId('add').click()
      expect(renderer.getPaintedText(), `after ${index} adds`).toContain(`task ${index}`)
    }

    await app.close()
  })

  it('moves a task between views when it is completed', async () => {
    const { render, renderer } = createTestRoot()
    render(<TodoApp />)
    const app = await connectTest(renderer)

    await app.getByTestId('toggle-t3').click()
    expect(rowTitles(renderer.getPaintedText())).toMatchInlineSnapshot(`
      [
        "Put a long list behind <virtual-list>",
        "Add a task",
      ]
    `)

    await app.getByTestId('view-done').click()
    expect(rowTitles(renderer.getPaintedText())).toMatchInlineSnapshot(`
      [
        "Read the GPUIX quickstart",
        "Draw the first window",
        "Wire a native <input> to React state",
        "Add a task",
      ]
    `)

    await app.close()
  })
})
