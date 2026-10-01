/**
 * Shared motion tokens for the app's calm, short animations (see CONTRACTS.md,
 * "Motion"). Components animate with the `m` component from "motion/react"
 * (never the full `motion` one) inside the LazyMotion/MotionConfig in
 * app/providers.tsx; use these tokens rather than ad-hoc durations.
 */
import type { Transition } from "motion/react";

/** Ease-out used by every tween. */
export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;

/** Gentler ease for the sidebar column slide: a soft start and a long settle, so a large move never lurches. */
export const MOTION_EASE_SLIDE = [0.4, 0, 0.2, 1] as const;

/** Durations in seconds: fades and small shifts, the slightly longer card/popup moves, and the sidebar column slide. */
export const MOTION_DURATION = { fast: 0.15, base: 0.2, slide: 0.26 } as const;

/** Fade/shift tween for content that appears (tab and route content, rows, popups). */
export const MOTION_FADE: Transition = { duration: MOTION_DURATION.base, ease: MOTION_EASE };

/** Quicker tween for exits and small items. */
export const MOTION_FADE_FAST: Transition = { duration: MOTION_DURATION.fast, ease: MOTION_EASE };

/** Delay in seconds between consecutive items of a staggered group. */
export const MOTION_STAGGER = 0.03;
