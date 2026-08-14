import type { Transition, Variants } from "motion/react";

/** Spring tuned for UI micro-interactions. */
export const spring: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 24,
};

/** Expressive ease-out for page/section transitions. */
export const ease = [0.22, 1, 0.36, 1] as const;

/** Single-element fade + rise. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.32, ease } },
};

/** Parent that staggers its children. */
export const stagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

/** Scale-in for emphasis blocks. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: spring },
};
