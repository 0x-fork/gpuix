import { createSignal } from "solid-js"
import { describe, expect, it } from "bun:test"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../index.js"
import { createTestRoot, hasNativeTestRenderer } from "../testing.js"

describe.skipIf(!hasNativeTestRenderer)("Solid controls", () => {
  it("selects with keyboard and click", () => {
    const [value, setValue] = createSignal("a")
    const app = createTestRoot()
    app.render(() => (
      <Select value={value()} onValueChange={setValue}>
        <SelectTrigger testId="trigger" style={{ width: 120, height: 32, backgroundColor: "#333333" }}>
          <text>open</text>
        </SelectTrigger>
        <SelectContent style={{ width: 120, backgroundColor: "#222222" }}>
          <SelectItem value="a"><text>A</text></SelectItem>
          <SelectItem value="b" testId="b" style={{ height: 28 }}><text>B</text></SelectItem>
        </SelectContent>
      </Select>
    ))
    const trigger = app.renderer.findByTestId("trigger")!
    app.renderer.nativeSimulateKeyDown(trigger.id, "down")
    app.renderer.simulateKeystrokes("down enter")
    expect(value()).toBe("b")

    app.renderer.nativeSimulateClick(60, 16)
    const item = app.renderer.findByTestId("b")!
    const bounds = app.renderer.getElementBounds(item.id)!
    app.renderer.nativeSimulateClick(bounds.x + 10, bounds.y + 10)
    expect(value()).toBe("b")
  })

  it("filters and submits a combobox item", () => {
    const [value, setValue] = createSignal<string | string[] | null>(null)
    const app = createTestRoot()
    app.render(() => (
      <Combobox items={["alpha", "beta"]} value={value()} onValueChange={setValue} defaultOpen>
        <ComboboxInput testId="input" style={{ width: 180, height: 32 }} />
        <ComboboxContent>
          <ComboboxItem value="alpha"><text>alpha</text></ComboboxItem>
          <ComboboxItem value="beta"><text>beta</text></ComboboxItem>
        </ComboboxContent>
      </Combobox>
    ))
    const input = app.renderer.findByTestId("input")!
    app.renderer.nativeSimulateKeyDown(input.id, "down")
    app.renderer.nativeSimulateKeystrokes(input.id, "enter")
    expect(value()).toBe("alpha")
  })

  it("opens tooltip through a real hover event and closes on click", () => {
    const app = createTestRoot()
    app.render(() => (
      <Tooltip>
        <TooltipTrigger testId="tip-trigger" style={{ width: 100, height: 32, backgroundColor: "#333333" }}>
          <text>hover</text>
        </TooltipTrigger>
        <TooltipContent><text>help</text></TooltipContent>
      </Tooltip>
    ))
    const trigger = app.renderer.findByTestId("tip-trigger")!
    const bounds = app.renderer.getElementBounds(trigger.id)!
    app.renderer.nativeSimulateMouseMove(bounds.x + 10, bounds.y + 10)
    expect(app.renderer.getAllText()).toContain("help")
    app.renderer.nativeSimulateClick(bounds.x + 10, bounds.y + 10)
    expect(app.renderer.getAllText()).not.toContain("help")
  })
})
