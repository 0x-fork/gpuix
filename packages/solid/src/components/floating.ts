import type { JSX } from "solid-js"
import type { EventPayload } from "@gpuix/native"
import type { HostProps, StyleDesc } from "@gpuix/native/host"
import { HostElement } from "../host.js"
import { jsx } from "../jsx-runtime.js"
import { spread } from "../universal.js"

export type FloatingSide = "top" | "right" | "bottom" | "left"
export type FloatingAlign = "start" | "center" | "end"
export type StateStyle<State> = StyleDesc | ((state: State) => StyleDesc)

export interface FloatingContentProps extends HostProps {
  children?: JSX.Element
  side?: FloatingSide
  sideOffset?: number
  align?: FloatingAlign
  alignOffset?: number
  collisionPadding?: number
}

export function resolveStyle<State>(
  style: StateStyle<State> | undefined,
  state: State
): StyleDesc | undefined {
  return typeof style === "function" ? style(state) : style
}

export function mergeStyles(
  base: StyleDesc | undefined,
  override: StyleDesc | undefined
): StyleDesc | undefined {
  if (!base) return override
  if (!override) return base
  return { ...base, ...override }
}

export function floatingRootStyle(style?: StyleDesc): StyleDesc {
  return { display: "flex", position: "relative", alignItems: "start", ...style }
}

export function composeHandlers(
  first?: (event: EventPayload) => void,
  second?: (event: EventPayload) => void
) {
  if (!first) return second
  if (!second) return first
  return (event: EventPayload) => {
    first(event)
    second(event)
  }
}

export function renderSlot(args: {
  asChild?: boolean
  children?: JSX.Element
  props: Record<string, unknown>
}): JSX.Element {
  if (!args.asChild) {
    return jsx("div", { ...args.props, get children() { return args.children } })
  }
  const child = args.children as unknown
  if (!(child instanceof HostElement)) {
    throw new Error("asChild requires one GPUIX intrinsic element")
  }
  spread(child, args.props)
  return child as never
}

export function FloatingLayer(props: FloatingContentProps): JSX.Element {
  const side = props.side ?? "bottom"
  const align = props.align ?? "start"
  const alignOffset = props.alignOffset ?? 0
  const offset = side === "top" || side === "bottom"
    ? { x: alignOffset, y: 0 }
    : { x: 0, y: alignOffset }
  return jsx("anchored", {
    side,
    align,
    gap: props.sideOffset ?? 0,
    offset,
    fit: "snap",
    snapMargin: props.collisionPadding ?? 8,
    deferred: true,
    priority: 1,
    occlude: props.style?.pointerEvents !== "none",
    get children() {
      return jsx("div", {
        ...props,
        style: mergeStyles({ backgroundColor: "#1A1A1A" }, props.style),
        get children() { return props.children },
      })
    },
  })
}
