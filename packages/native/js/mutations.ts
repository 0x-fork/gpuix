import type { MutationHost, MutationRenderer } from "./host.js"

export type MutationValue = number | string | boolean | object | null
export type MutationTuple = [string, ...MutationValue[]]

/** Atomic mutation queue shared by all framework adapters. */
export interface MutationQueue extends MutationRenderer {
  readonly pending: number
}

export function createMutationQueue(
  renderer: MutationHost,
  onDestroyed: (ids: readonly number[]) => void = () => {},
  scheduleFlush?: (flush: () => void) => void
): MutationQueue {
  let queue: MutationTuple[] = []
  let flushScheduled = false

  const enqueue = (mutation: MutationTuple) => {
    queue.push(mutation)
    if (!scheduleFlush || flushScheduled) return
    flushScheduled = true
    scheduleFlush(() => {
      if (!flushScheduled) return
      flushScheduled = false
      mutations.flushMutations()
    })
  }

  const mutations: MutationQueue = {
    get pending() {
      return queue.length
    },
    createElement(id, elementType) {
      enqueue(["createElement", id, elementType])
    },
    destroyElement(id) {
      enqueue(["destroyElement", id])
      return []
    },
    appendChild(parentId, childId) {
      enqueue(["appendChild", parentId, childId])
    },
    insertBefore(parentId, childId, beforeId) {
      enqueue(["insertBefore", parentId, childId, beforeId])
    },
    setStyle(id, style) {
      enqueue(["setStyle", id, style])
    },
    setText(id, content) {
      enqueue(["setText", id, content])
    },
    setEventListener(id, eventType, hasHandler) {
      enqueue(["setEventListener", id, eventType, hasHandler])
    },
    setRoot(id) {
      enqueue(["setRoot", id])
    },
    setCustomProp(id, key, value) {
      enqueue(["setCustomProp", id, key, value])
    },
    flushMutations() {
      flushScheduled = false
      if (queue.length === 0) return
      const destroyed = renderer.applyBatch(JSON.stringify(queue))
      onDestroyed(destroyed)
      queue = []
    },
  }
  return mutations
}

export const EVENT_PROPS = [
  ["onToggleFile", "toggleFile"],
  ["onShowMore", "showMore"],
  ["onLineClick", "lineClick"],
  ["onLinkClick", "linkClick"],
  ["onVisibleRange", "visibleRange"],
  ["onHighlight", "highlight"],
  ["onMotionComplete", "motionComplete"],
  ["onChange", "change"],
  ["onSubmit", "submit"],
  ["onClick", "click"],
  ["onAuxClick", "auxClick"],
  ["onMouseDown", "mouseDown"],
  ["onMouseUp", "mouseUp"],
  ["onMouseEnter", "mouseEnter"],
  ["onMouseLeave", "mouseLeave"],
  ["onMouseMove", "mouseMove"],
  ["onMouseDownOutside", "mouseDownOutside"],
  ["onKeyDown", "keyDown"],
  ["onKeyUp", "keyUp"],
  ["onFocus", "focus"],
  ["onBlur", "blur"],
  ["onScroll", "scroll"],
  ["onFileDrop", "fileDrop"],
] as const

export const EVENT_PROP_NAMES: ReadonlySet<string> = new Set(
  EVENT_PROPS.map(([name]) => name)
)

export const RESERVED_PROPS: ReadonlySet<string> = new Set([
  "style",
  "className",
  "children",
  "key",
  "ref",
])

export const BUILT_IN_TYPES: ReadonlySet<string> = new Set(["div", "text"])

export const UNIVERSAL_PROPS: ReadonlySet<string> = new Set([
  "autoFocus",
  "tabIndex",
  "motion",
  "testId",
  "highlight",
  "role",
  "aria-label",
  "aria-description",
  "aria-id",
  "aria-expanded",
  "aria-selected",
  "aria-valuetext",
  "aria-level",
])

export function isReservedProp(name: string): boolean {
  return RESERVED_PROPS.has(name) || EVENT_PROP_NAMES.has(name)
}

export function serializeCustomProp(
  value: object | string | number | boolean | null | undefined
): string | object | number | boolean | null {
  if (value === undefined || typeof value === "function") return null
  return value
}
