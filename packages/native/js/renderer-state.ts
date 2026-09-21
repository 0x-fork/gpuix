import type { EventPayload } from "../index.js"
import type {
  ElementIdAllocator,
  EventHandlerMap,
  NativeRenderer,
  WindowKeyEventHandler,
} from "./host.js"

export interface RendererRootHandlers {
  eventHandlers?: EventHandlerMap
  onWindowKeyDown?: WindowKeyEventHandler
  onWindowKeyUp?: WindowKeyEventHandler
  onSelectionChange?: WindowKeyEventHandler
  onEvent?: (event: EventPayload) => void
  schedule?: (dispatch: () => void) => void
}

export interface RendererRootBinding {
  readonly ids: ElementIdAllocator
  readonly eventHandlers: EventHandlerMap
  readonly windowKeyEventId: number
  readonly windowSelectionEventId: number
  detach(): boolean
}

export interface RendererState {
  readonly ids: ElementIdAllocator
  attach(handlers?: RendererRootHandlers): RendererRootBinding
  dispatch(event: EventPayload): boolean
  current(): RendererRootBinding | undefined
}

type ActiveRoot = RendererRootBinding & { handlers: RendererRootHandlers }

const STATE_KEY = Symbol.for("@gpuix/native/renderer-states")

function allStates(): WeakMap<NativeRenderer, RendererState> {
  const existing = Reflect.get(globalThis, STATE_KEY) as
    | WeakMap<NativeRenderer, RendererState>
    | undefined
  if (existing) return existing
  const states = new WeakMap<NativeRenderer, RendererState>()
  Reflect.set(globalThis, STATE_KEY, states)
  return states
}

export function createRendererState(renderer: NativeRenderer): RendererState {
  const existing = allStates().get(renderer)
  if (existing) return existing

  const ids = { nextElementId: 0 }
  let generation = 0
  let active: ActiveRoot | undefined
  const state: RendererState = {
    ids,
    attach(handlers = {}) {
      if (active) {
        throw new Error(
          "This renderer already drives a mounted GPUIX root. One renderer owns one window, one native root id, and one event map, so a second root would silently take both over. Unmount the first root first."
        )
      }
      generation += 1
      const eventHandlers = handlers.eventHandlers ?? new Map()
      const binding: ActiveRoot = {
        ids,
        handlers,
        eventHandlers,
        windowKeyEventId: generation,
        windowSelectionEventId: generation,
        detach() {
          if (active !== binding) return false
          active = undefined
          return true
        },
      }
      active = binding
      return binding
    },
    dispatch(event) {
      const root = active
      if (!root) return false
      const run = (handler: (() => void) | undefined): boolean => {
        if (!handler) return false
        const invoke = () => {
          handler()
          root.handlers.onEvent?.(event)
        }
        if (root.handlers.schedule) root.handlers.schedule(invoke)
        else invoke()
        return true
      }
      if (event.eventType === "windowKeyDown") {
        if (event.elementId !== root.windowKeyEventId) return false
        const handler = root.handlers.onWindowKeyDown
        return run(handler ? () => handler(
          { ...event, elementId: 0, eventType: "keyDown" },
          renderer
        ) : undefined)
      }
      if (event.eventType === "windowKeyUp") {
        if (event.elementId !== root.windowKeyEventId) return false
        const handler = root.handlers.onWindowKeyUp
        return run(handler ? () => handler(
          { ...event, elementId: 0, eventType: "keyUp" },
          renderer
        ) : undefined)
      }
      if (event.eventType === "selectionChange") {
        if (event.elementId !== root.windowSelectionEventId) return false
        const handler = root.handlers.onSelectionChange
        return run(handler ? () => handler(
          { ...event, elementId: 0 },
          renderer
        ) : undefined)
      }
      const handler = root.eventHandlers.get(event.elementId)?.get(event.eventType)
      return run(handler ? () => handler(event) : undefined)
    },
    current: () => active,
  }
  allStates().set(renderer, state)
  return state
}

export function registerEventHandler(
  eventHandlers: EventHandlerMap,
  elementId: number,
  eventType: string,
  handler: (event: EventPayload) => void
): void {
  const handlers = eventHandlers.get(elementId) ?? new Map()
  handlers.set(eventType, handler)
  eventHandlers.set(elementId, handlers)
}

export function unregisterEventHandler(
  eventHandlers: EventHandlerMap,
  elementId: number,
  eventType: string
): void {
  const handlers = eventHandlers.get(elementId)
  if (!handlers) return
  handlers.delete(eventType)
  if (handlers.size === 0) eventHandlers.delete(elementId)
}

export function unregisterEventHandlers(
  eventHandlers: EventHandlerMap,
  elementId: number
): void {
  eventHandlers.delete(elementId)
}
