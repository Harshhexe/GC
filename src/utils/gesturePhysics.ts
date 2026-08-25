/**
 * The two curves that make a dragged surface feel like an object.
 *
 * Shared by every dismissible surface in GC so a sheet and a full-screen page
 * resist and coast identically — the physics is a property of the app, not of
 * one component that happened to implement it first.
 */

/**
 * Where a throw would come to rest.
 *
 * Uses the exponential-decay model that matches native scroll deceleration,
 * not the physics-textbook v²/2a — the latter decelerates too abruptly and
 * makes a flick feel like it hit something. Feeding the *projected* endpoint
 * into the dismiss decision is what lets a fast flick from halfway up dismiss
 * while a slow drag to the same point settles back: the gesture is judged on
 * where it was heading, not where the finger happened to stop.
 */
export function project(velocity: number, decelerationRate = 0.998) {
  'worklet';
  return (velocity / 1000) * (decelerationRate / (1 - decelerationRate));
}

/**
 * Progressive resistance past a boundary.
 *
 * The further past the edge, the less the surface follows. A hard stop reads
 * as "frozen"; continuous resistance reads as "responsive, but there's nothing
 * more here".
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  'worklet';
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** The spring every dismissible surface settles and leaves on. */
export const dismissSpring = {
  damping: 30,
  stiffness: 260,
  mass: 0.8,
} as const;
