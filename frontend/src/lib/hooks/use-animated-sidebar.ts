import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion";

export interface AnimatedSidebarOptions {
  collapsed: boolean;
  /** False where the sidebar must switch instantly (mobile, focus mode); reduced motion is handled here. */
  enabled: boolean;
  /** The sidebar column's resting width, open or collapsed; read when a toggle starts. */
  restWidth: (collapsed: boolean) => number;
  /** Re-applies the layout for the column's current width (null = at rest); called at the start, every frame and at the end. */
  onFrame: (width: number | null) => void;
  /** Called once an animated column has settled: the place for expensive measuring or re-fitting. */
  onSettled?: () => void;
}

export interface AnimatedSidebar {
  /** Whether the column is mid-animation (e.g. to defer a ResizeObserver re-fit until it settles). */
  isAnimating: () => boolean;
}

/**
 * Slides a collapsible sidebar's column open or closed by tweening its width
 * (Motion tokens; instant when `enabled` is false or the user prefers reduced
 * motion). CSS cannot interpolate a grid track between a minmax() and 0, so
 * the page applies the width from `onFrame` to its layout on every frame and the
 * column, sidebar and content move together. Call it after the effect that
 * keeps `onFrame`'s inputs current, so the starting width is applied before paint.
 */
export function useAnimatedSidebar({ collapsed, enabled, restWidth, onFrame, onSettled }: AnimatedSidebarOptions): AnimatedSidebar {
  const reduceMotion = useReducedMotion();
  const width = useRef<number | null>(null);
  const animation = useRef<AnimationPlaybackControls | null>(null);
  const settledCollapsed = useRef(collapsed);
  const latest = useRef({ restWidth, onFrame, onSettled });
  useLayoutEffect(() => {
    latest.current = { restWidth, onFrame, onSettled };
  });

  useLayoutEffect(() => {
    if (settledCollapsed.current === collapsed) {
      return;
    }
    settledCollapsed.current = collapsed;
    const from = width.current ?? latest.current.restWidth(!collapsed);
    const animated = enabled && !reduceMotion;
    animation.current?.stop();
    animation.current = null;
    width.current = animated ? from : null;
    latest.current.onFrame(width.current);
    if (!animated) {
      return;
    }
    animation.current = animate(from, latest.current.restWidth(collapsed), {
      duration: MOTION_DURATION.base,
      ease: MOTION_EASE,
      onUpdate: (value) => {
        width.current = value;
        latest.current.onFrame(width.current);
      },
      onComplete: () => {
        width.current = null;
        animation.current = null;
        latest.current.onFrame(width.current);
        latest.current.onSettled?.();
      }
    });
  }, [collapsed, enabled, reduceMotion]);

  useEffect(() => () => animation.current?.stop(), []);

  const isAnimating = useCallback(() => animation.current !== null, []);
  return { isAnimating };
}
