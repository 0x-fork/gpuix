import { createSignal } from "solid-js"

export function createView() {
  const [value, setValue] = createSignal(1)
  return {
    view: () => <text>consumer {value()}</text>,
    update: () => setValue(2),
  }
}
