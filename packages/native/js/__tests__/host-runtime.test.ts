import { describe, expect, it } from "vitest"
import {
  createMutationQueue,
  createRendererState,
  findRanges,
  observeWindowInsets,
  observeWindowSize,
  observeSelectedText,
} from "../host.js"
import type { NativeRenderer } from "../host.js"

class RecordingRenderer implements NativeRenderer {
  batches: unknown[][] = []
  fail = false
  width = 320
  height = 200

  applyBatch(json: string): number[] {
    if (this.fail) throw new Error("native failure")
    this.batches.push(JSON.parse(json))
    return [9]
  }

  getWindowSize() {
    return { width: this.width, height: this.height }
  }

  getWindowInsets() {
    return {
      safeArea: { top: 1, right: 2, bottom: 3, left: 4 },
      ime: { top: 0, right: 0, bottom: 20, left: 0 },
      effective: { top: 1, right: 2, bottom: 20, left: 4 },
    }
  }
}

describe("shared host runtime", () => {
  it("retains failed mutations and cleans handlers after success", () => {
    const renderer = new RecordingRenderer()
    const removed: number[] = []
    const mutations = createMutationQueue(renderer, (ids) => removed.push(...ids))

    mutations.createElement(1, "div")
    mutations.destroyElement(9)
    renderer.fail = true
    expect(() => mutations.flushMutations()).toThrow("native failure")
    expect(mutations.pending).toBe(2)
    expect(removed).toEqual([])

    renderer.fail = false
    mutations.flushMutations()
    expect(renderer.batches).toMatchInlineSnapshot(`
      [
        [
          [
            "createElement",
            1,
            "div",
          ],
          [
            "destroyElement",
            9,
          ],
        ],
      ]
    `)
    expect(removed).toEqual([9])
  })

  it("owns one live root and rejects stale window events", () => {
    const renderer = new RecordingRenderer()
    const state = createRendererState(renderer)
    const received: string[] = []
    const first = state.attach({
      onWindowKeyDown: (event) => received.push(event.key ?? ""),
    })

    expect(
      state.dispatch({
        elementId: first.windowKeyEventId,
        eventType: "windowKeyDown",
        key: "a",
      })
    ).toBe(true)
    first.detach()

    const second = state.attach({
      onWindowKeyDown: (event) => received.push(event.key ?? ""),
    })
    expect(
      state.dispatch({
        elementId: first.windowKeyEventId,
        eventType: "windowKeyDown",
        key: "stale",
      })
    ).toBe(false)
    expect(second.windowKeyEventId).not.toBe(first.windowKeyEventId)
    expect(received).toEqual(["a"])
  })

  it("observes window geometry and stops polling", async () => {
    const renderer = new RecordingRenderer()
    const sizes: unknown[] = []
    const insets: unknown[] = []
    const stopSize = observeWindowSize(renderer, (value) => sizes.push(value), {
      intervalMs: 16,
    })
    const stopInsets = observeWindowInsets(renderer, (value) => insets.push(value), {
      intervalMs: false,
    })

    renderer.width = 640
    await new Promise((resolve) => setTimeout(resolve, 25))
    stopSize()
    stopInsets()

    expect(sizes).toEqual([
      { width: 320, height: 200 },
      { width: 640, height: 200 },
    ])
    expect(insets).toMatchInlineSnapshot(`
      [
        {
          "effective": {
            "bottom": 20,
            "left": 4,
            "right": 2,
            "top": 1,
          },
          "ime": {
            "bottom": 20,
            "left": 0,
            "right": 0,
            "top": 0,
          },
          "keyboardTop": 180,
          "keyboardVisible": true,
          "safeArea": {
            "bottom": 3,
            "left": 4,
            "right": 2,
            "top": 1,
          },
          "visibleHeight": 179,
        },
      ]
    `)
  })

  it("shares the native-compatible text matcher", () => {
    expect(findRanges({ text: "One one stone", query: "one", wholeWord: true }))
      .toEqual([[0, 3], [4, 7]])
  })

  it("observes selected text and removes its callback", () => {
    const renderer = new RecordingRenderer() as RecordingRenderer & {
      getSelectedText(): string | null
    }
    renderer.getSelectedText = () => "initial"
    let listener: ((event: { value?: string }) => void) | undefined
    const values: Array<string | null> = []
    const stop = observeSelectedText(
      renderer,
      (next) => {
        listener = next
        return () => { listener = undefined }
      },
      (value) => values.push(value)
    )
    listener?.({ value: "changed" })
    stop()
    listener?.({ value: "ignored" })
    expect(values).toEqual(["initial", "changed"])
  })
})
