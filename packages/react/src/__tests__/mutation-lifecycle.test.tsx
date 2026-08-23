import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"
import type { NativeRenderer } from "../types/host.js"
import { handleGpuixEvent } from "../reconciler/event-registry.js"

vi.mock("@gpuix/native", () => ({ GpuixRenderer: class {} }))

import { createRoot, flushSync } from "../reconciler/renderer.js"

type Mutation = [string, ...unknown[]]

class RecordingRenderer implements NativeRenderer {
  batches: Mutation[][] = []

  createElement(): void {}
  destroyElement(): number[] {
    return []
  }
  appendChild(): void {}
  removeChild(): void {}
  insertBefore(): void {}
  setStyle(): void {}
  setText(): void {}
  setEventListener(): void {}
  setRoot(): void {}
  commitMutations(): void {}
  setCustomProp(): void {}

  applyBatch(json: string): number[] {
    this.batches.push(JSON.parse(json) as Mutation[])
    return []
  }

  mutations(): Mutation[] {
    return this.batches.flat()
  }
}


describe("mutation lifecycle", () => {
  it("does not flush host nodes from an abandoned Suspense render", () => {
    const renderer = new RecordingRenderer()
    const root = createRoot(renderer)
    const pending = new Promise<never>(() => {})

    function Suspend(): never {
      throw pending
    }

    flushSync(() => {
      root.render(
        <Suspense fallback={<text>fallback</text>}>
          <div>
            <text>abandoned</text>
          </div>
          <Suspend />
        </Suspense>
      )
    })

    const paintedText = renderer
      .mutations()
      .filter(([operation]) => operation === "setText")
      .map(([, , text]) => text)

    expect(paintedText).toEqual(["fallback"])
  })

  it("keeps unchanged event handlers registered across renders", () => {
    const renderer = new RecordingRenderer()
    const root = createRoot(renderer)
    const onClick = vi.fn()

    flushSync(() => root.render(<div onClick={onClick} />))
    const create = renderer
      .mutations()
      .find(([operation, , elementType]) => operation === "createElement" && elementType === "div")
    expect(create).toBeDefined()
    const elementId = create![1] as number

    handleGpuixEvent({ elementId, eventType: "click" })
    flushSync(() => root.render(<div onClick={onClick} />))
    handleGpuixEvent({ elementId, eventType: "click" })

    expect(onClick).toHaveBeenCalledTimes(2)
  })
})
