import { Easing, ReduceMotion } from 'react-native-reanimated';

/**
 * One motion vocabulary for the whole app. Every animation pulls its duration
 * and easing from here so the app moves with a single rhythm instead of each
 * screen inventing its own timing.
 */

export const duration = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 360,
  page: 500,
} as const;

export const easing = {
  /** Expo-out. Fast departure, long soft landing — the "premium" curve. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
} as const;

export const spring = {
  /** Sheets, modals — smooth, settles immediately without wobbling. */
  soft: { damping: 30, stiffness: 220, mass: 0.8 },
  /** Subtle, crisp motion — zero bouncy overshoot. */
  bouncy: { damping: 32, stiffness: 240, mass: 0.7 },
  /** Press feedback — instant, tight, minimal. */
  snappy: { damping: 36, stiffness: 320, mass: 0.5 },
} as const;

/**
 * Reanimated honors the OS "reduce motion" setting when a config carries this
 * flag: springs/timings resolve instantly to their final value instead of
 * animating. Attach it to every animation rather than gating at the call site.
 */
export const reduceMotion = ReduceMotion.System;

export const timingBase = {
  duration: duration.base,
  easing: easing.out,
  reduceMotion,
} as const;

export const timingFast = {
  duration: duration.fast,
  easing: easing.out,
  reduceMotion,
} as const;

export const springSoft = { ...spring.soft, reduceMotion } as const;
export const springBouncy = { ...spring.bouncy, reduceMotion } as const;
export const springSnappy = { ...spring.snappy, reduceMotion } as const;

/** Stagger step for list entrances — small enough to feel like one gesture. */
export const STAGGER_MS = 45;
