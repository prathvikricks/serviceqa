import type { Variants, Transition } from 'framer-motion'

/**
 * Shared, restrained motion presets so animation feels consistent across the app.
 * Kept subtle on purpose — gentle fades and small offsets, no springy overshoot —
 * to match the clean-minimal design direction.
 */

export const easeOut: Transition = { duration: 0.18, ease: [0.16, 1, 0.3, 1] }

/** Backdrop / overlay fade. */
export const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
} as const

/** Dialog / modal panel: fade + tiny scale and lift. */
export const panelMotion = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 6 },
  transition: easeOut,
} as const

/** Toast: slide in from the right and fade. */
export const toastMotion = {
  initial: { opacity: 0, x: 24, scale: 0.96 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 24, scale: 0.96 },
  transition: easeOut,
} as const

/** Container that staggers its children in — pair with `fadeUpItem`. */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
}

/** A single fade-up item, e.g. for KPI cards or list entries. */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: easeOut },
}
