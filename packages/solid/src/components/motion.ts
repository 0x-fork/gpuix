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
  spread(element, mergeProps(hostProps, {
    get motion() {
      return {
        initial: presence?.initial === false ? false : motionProps.initial,
        animate: presence && !presence.isPresent() && motionProps.exit
          ? motionProps.exit
          : motionProps.animate,
        exit: motionProps.exit,
        transition: motionProps.transition,
      }
    },
    onMotionComplete(event) {
      hostProps.onMotionComplete?.(event)
      if (presence && !presence.isPresent()) presence.safeToRemove()
    },
  }))
  return element as never
}

export const motion = { div: MotionDiv } as const
