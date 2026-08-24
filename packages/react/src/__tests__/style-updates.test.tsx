/// Style update batching: skip setStyle when the style did not change.

import React from "react"
import { describe, expect, it } from "vitest"
import { createTestRoot } from "../testing.js"
import type { StyleDesc } from "../types/host.js"

const SHARED: StyleDesc = {
  display: "flex",
  height: 40,
  flexShrink: 0,
  alignItems: "center",
}

function styleOps(batch: Array<Array<unknown>>) {
  return batch.filter((op) => op[0] === "setStyle")
}

function internOps(batch: Array<Array<unknown>>) {
  return batch.filter((op) => op[0] === "internStyle")
}

function styleIdOps(batch: Array<Array<unknown>>) {
  return batch.filter((op) => op[0] === "setStyleId")
}

describe("style updates", () => {
  it("does not resend a shared style object on a later commit", () => {
    const { render, renderer } = createTestRoot()
    const tree = (label: string) => (
      <div style={SHARED}>
        <text>{label}</text>
      </div>
    )

    render(tree("one"))
    expect(internOps(renderer.lastBatchOps)).toHaveLength(1)
    expect(styleIdOps(renderer.lastBatchOps).length).toBeGreaterThan(0)

    render(tree("two"))
    expect(styleOps(renderer.lastBatchOps)).toEqual([])
    expect(renderer.findByType("div")[0]?.style).toMatchObject(SHARED)
  })

  it("does not resend a new style object with the same fields", () => {
    const { render, renderer } = createTestRoot()
    const tree = (label: string) => (
      <div style={{ display: "flex", height: 40, color: "#cdd6f4" }}>
        <text>{label}</text>
      </div>
    )

    render(tree("one"))
    render(tree("two"))
    expect(styleOps(renderer.lastBatchOps)).toEqual([])
    expect(internOps(renderer.lastBatchOps)).toEqual([])
    expect(styleIdOps(renderer.lastBatchOps)).toEqual([])
  })

  it("interns a new style when a field changes", () => {
    const { render, renderer } = createTestRoot()
    const tree = (color: string) => (
      <div style={{ display: "flex", color }}>
        <text>x</text>
      </div>
    )

    render(tree("#cdd6f4"))
    render(tree("#f38ba8"))
    expect(internOps(renderer.lastBatchOps)[0]?.[2]).toMatchObject({ color: "#f38ba8" })
    expect(styleIdOps(renderer.lastBatchOps)).toHaveLength(1)
    expect(renderer.findByType("div")[0]?.style.color).toBe("#f38ba8")
  })

  it("interns a new style when a nested hover style changes", () => {
    const { render, renderer } = createTestRoot()
    const tree = (hoverColor: string) => (
      <div style={{ backgroundColor: "#1e1e2e", hover: { backgroundColor: hoverColor } }}>
        <text>x</text>
      </div>
    )

    render(tree("#313244"))
    render(tree("#45475a"))
    expect(internOps(renderer.lastBatchOps)[0]?.[2]).toMatchObject({
      hover: { backgroundColor: "#45475a" },
    })
    expect(styleIdOps(renderer.lastBatchOps)).toHaveLength(1)
  })

  it("clears style when the style prop is removed", () => {
    const { render, renderer } = createTestRoot()
    render(
      <div style={{ color: "#cdd6f4" }}>
        <text>x</text>
      </div>,
    )
    render(
      <div>
        <text>x</text>
      </div>,
    )
    const ops = styleOps(renderer.lastBatchOps)
    expect(ops).toHaveLength(1)
    expect(ops[0]?.[2]).toEqual({})
  })

  it("interns one shared style for many nodes", () => {
    const { render, renderer } = createTestRoot()
    render(
      <div>
        {Array.from({ length: 20 }, (_, index) => (
          <div key={index} style={SHARED}>
            <text>{`row-${index}`}</text>
          </div>
        ))}
      </div>,
    )
    expect(internOps(renderer.lastBatchOps)).toHaveLength(1)
    expect(styleIdOps(renderer.lastBatchOps)).toHaveLength(20)
    expect(
      styleOps(renderer.lastBatchOps).filter((op) => {
        const style = op[2]
        return typeof style === "object" && style != null && "height" in style
      }),
    ).toEqual([])
    expect(renderer.findByType("div").filter((node) => node.style.height === 40)).toHaveLength(20)
  })

  it("reuses a shared style after every user is removed", () => {
    const { render, renderer } = createTestRoot()
    const rows = (
      <div>
        <div style={SHARED}>
          <text>row</text>
        </div>
      </div>
    )
    render(rows)
    render(<div />)
    render(rows)
    expect(internOps(renderer.lastBatchOps)).toEqual([])
    expect(styleIdOps(renderer.lastBatchOps).length).toBeGreaterThan(0)
    expect(renderer.findByType("div").some((node) => node.style.height === 40)).toBe(true)
  })
})
