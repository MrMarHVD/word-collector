/**
 * Canonical floating panel (SPEC-005 D2): a non-modal, anchored layer with the glass material and
 * `shadow-float`, the same look and radius as PopoverContent. It has no focus trap and no outside-click
 * handling; the consumer owns dismissal and positioning.
 */
import * as React from "react";
import { m, type HTMLMotionProps } from "motion/react";
import { MOTION_FADE, MOTION_FADE_FAST } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type FloatingPanelProps = Omit<HTMLMotionProps<"aside">, "animate" | "initial" | "transition" | "onAnimationComplete"> & {
  /** Open state. `false` plays the exit and then makes the panel inert (`aria-hidden`, no pointer events). */
  open: boolean;
  /** Viewport position in px (`position: fixed`). Omit when a class or CSS variables place the panel. */
  position?: { left: number; top: number };
  /** CSS `transform-origin` for the scale part of the enter and exit animation. */
  transformOrigin?: string;
  /** Called once the exit animation has finished; pass `hidden` after that to remove the panel from layout. */
  onExitComplete?: () => void;
};

/**
 * Fades and scales in from `transformOrigin` and out again (Motion tokens; reduced motion is honoured by
 * `MotionConfig`). The ref and every other DOM prop (id, data-*, aria-*, hidden, onKeyDown) go to the `aside`.
 */
const FloatingPanel = React.forwardRef<HTMLElement, FloatingPanelProps>(function FloatingPanel(
  { open, position, transformOrigin, onExitComplete, className, style, ...props },
  ref
) {
  return (
    <m.aside
      ref={ref}
      data-slot="floating-panel"
      aria-hidden={open ? undefined : true}
      className={cn("fixed z-10 rounded-container p-4 text-main glass shadow-float", className)}
      style={{ ...position, transformOrigin, ...(open ? null : { pointerEvents: "none" }), ...style }}
      initial={false}
      animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.97 }}
      transition={open ? MOTION_FADE : MOTION_FADE_FAST}
      onAnimationComplete={() => !open && onExitComplete?.()}
      {...props}
    />
  );
});

export { FloatingPanel };
