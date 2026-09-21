import { createRenderEffect, mergeProps, splitProps, type JSX } from "solid-js"
import type { MotionProps, SolidHostProps } from "../jsx-runtime.js"
import { createElement, spread } from "../universal.js"
import { useContext } from "solid-js"
import { PresenceContext } from "./animate-presence.js"

export interface MotionDivProps extends SolidHostProps, MotionProps {}

function MotionDiv(props: MotionDivProps): JSX.Element {
  const [motionProps, hostProps] = splitProps(props, [
    "initial",
    "animate",
    "exit",
    "transition",
  ])
  const presence = useContext(PresenceContext)
  createRenderEffect(() => {
    if (presence && !presence.isPresent() && !motionProps.exit) {
      presence.safeToRemove()
    }
  })
  const element = createElement("div")
  let generation = 0
  let targetKey: string | undefined
  spread(element, mergeProps(hostProps, {
    get motion() {
      const isExit = Boolean(presence && !presence.isPresent() && motionProps.exit)
      const initial = presence?.initial === false ? false : motionProps.initial
      const animate = isExit ? motionProps.exit! : motionProps.animate
      const nextKey = JSON.stringify([isExit, initial, animate, motionProps.transition])
      if (nextKey !== targetKey) {
        targetKey = nextKey
        generation += 1
      }
      return {
        generation,
        isExit,
        initial,
        animate,
        exit: motionProps.exit,
        transition: motionProps.transition,
      }
    },
    onMotionComplete(event) {
      if (event.motionGeneration !== generation) return
      hostProps.onMotionComplete?.(event)
      if (presence && !presence.isPresent()) presence.safeToRemove()
    },
  }))
  return element as never
}

export const motion = { div: MotionDiv } as const
