import type { Transition, Variants } from 'motion/react'

/** Single motion language for the timeline tip and the chart tip. */
export const HOVER_TIP_SPRING = { stiffness: 300, damping: 28, mass: 0.2 }

export const TIP_APPEAR_TRANSITION: Transition = {
  duration: 0.12,
  ease: 'easeOut',
}

/** Number swap. Faster and subtler than the first pass. */
export const TIP_TEXT_TRANSITION: Transition = {
  duration: 0.12,
  ease: 'easeOut',
}

export const REDUCED_TIP_TEXT_TRANSITION: Transition = { duration: 0 }

export const tipTextVariants: Variants = {
  enter: (dir: number) => ({ x: dir * 16, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -16, opacity: 0 }),
}

export const reducedTipTextVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
}
