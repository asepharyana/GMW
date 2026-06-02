import { type Variants } from "framer-motion";

/**
 * Parent container variant for staggerChildren.
 * Use on motion.div wrapping a list of cardItem children.
 */
export const cardStagger: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

/**
 * Child item variant for fade + slide up.
 * Intended as a child of cardStagger.
 */
export const cardItem: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

/**
 * Single element variant: fade + slide up with a cubic-bezier ease.
 * Supports exit animation (fade out + slide up).
 */
export const fadeSlideUp: Variants = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

/**
 * Simple fade variant for generic element transitions.
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/**
 * Scale + fade variant for badges, pills, or small decorative elements.
 */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.8 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "backOut" },
  },
};

/**
 * Spring-based entrance for important elements.
 */
export const springUp: Variants = {
  initial: { opacity: 0, y: 30 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 200, damping: 20 },
  },
};
