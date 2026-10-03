import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { animate, useReducedMotion, type AnimationPlaybackControls } from "motion/react";
import { MOTION_DURATION, MOTION_EASE_SLIDE } from "@/lib/motion";

export interface AnimatedSidebarOptions {
  collapsed: boolean;
  /** False where the sidebar must switch instantly (mobile); reduced motion is handled here. */
  enabled: boolean;
  /** The sidebar column's resting width, open or collapsed; read when a toggle starts. */
  restWidth: (collapsed: boolean) => number;
  /** Re-applies the layout for the column's current width (null = at rest); called at the start, every frame and at the end. */
  onFrame: (width: number | null) => void;
  /** The sidebar element: its opacity follows the column's width each frame (cleared at rest, where CSS owns it). */
  sidebar?: RefObject<HTMLElement | null>;
  /** Called once an animated column has settled: the place for expensive measuring or re-fitting. */
  onSettled?: () => void;
}

export interface AnimatedSidebar {
  /** Whether the column is mid-animation (e.g. to defer a ResizeObserver re-fit until it settles). */
  isAnimating: () => boolean;
}

/** Fully visible until the column is two-thirds open, then fading out as it closes, so the content is still readable while it slides. */
function sidebarOpacity(openness: number): number {
  return Math.min(1, Math.max(0, openness * 1.5));
}

/**
 * Slides a collapsible sidebar's column open or closed by tweening its width
 * and fading the sidebar from the same progress (Motion tokens; instant when `enabled` is false or the user prefers reduced
 * motion). CSS cannot interpolate a grid track between a minmax() and 0, so
 * the page applies the width from `onFrame` to its layout on every frame and the
 * column, sidebar and content move together. Call it after the effect that
 * keeps `onFrame`'s inputs current, so the starting width is applied before paint.
 */
export function useAnimatedSidebar({ collapsed, enabled, restWidth, onFrame, sidebar, onSettled }: AnimatedSidebarOptions): AnimatedSidebar {
  const reduceMotion = useReducedMotion();
  const width = useRef<number | null>(null);
  const animation = useRef<AnimationPlaybackControls | null>(null);
  const settledCollapsed = useRef(collapsed);
  const latest = useRef({ restWidth, onFrame, onSettled, sidebar });
  useLayoutEffect(() => {
    latest.current = { restWidth, onFrame, onSettled, sidebar };
  });

  /** Applies the column width to the layout and fades the sidebar in step with it (null = at rest). */
  const apply = useCallback((value: number | null) => {
    width.current = value;
    const { restWidth: rest, onFrame: frame, sidebar: element } = latest.current;
    frame(value);
    if (element?.current) {
      const closed = rest(true);
      const span = rest(false) - closed;
      element.current.style.opacity = value === null || span <= 0 ? "" : String(sidebarOpacity((value - closed) / span));
    }
  }, []);

  useLayoutEffect(() => {
    if (settledCollapsed.current === collapsed) {
      return;
    }
    settledCollapsed.current = collapsed;
    const from = width.current ?? latest.current.restWidth(!collapsed);
    const animated = enabled && !reduceMotion;
    animation.current?.stop();
    animation.current = null;
    apply(animated ? from : null);
    if (!animated) {
      return;
    }
    animation.current = animate(from, latest.current.restWidth(collapsed), {
      duration: MOTION_DURATION.slide,
      ease: MOTION_EASE_SLIDE,
      onUpdate: apply,
      onComplete: () => {
        animation.current = null;
        apply(null);
        latest.current.onSettled?.();
      }
    });
  }, [collapsed, enabled, reduceMotion, apply]);

  useEffect(() => () => animation.current?.stop(), []);

  const isAnimating = useCallback(() => animation.current !== null, []);
  return { isAnimating };
}
