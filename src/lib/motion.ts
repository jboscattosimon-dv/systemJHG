import type { Variants } from 'framer-motion'

const ease = [0.25, 0.46, 0.45, 0.94] as const

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.38, ease } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
}

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.18 } },
}

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.32, ease } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.18 } },
}

export const stagger: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.055 } },
}

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.38, ease } },
}

export const spring = { type: 'spring', stiffness: 400, damping: 30 } as const
