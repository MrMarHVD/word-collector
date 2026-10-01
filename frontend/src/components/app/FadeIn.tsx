import type { ReactNode } from "react";
import { m } from "motion/react";
import { MOTION_FADE } from "@/lib/motion";

/**
 * Mount fade with a 4px rise for content that appears. Opacity and translate
 * only, so layout and reduced-motion policy are handled by the app-wide
 * MotionConfig. `rise={false}` fades without any transform, for wrappers that
 * contain `position: fixed` content (a transform would become its containing block).
 */
export function FadeIn({ children, className, rise = true }: { children: ReactNode; className?: string; rise?: boolean }) {
  return (
    <m.div
      className={className}
      initial={rise ? { opacity: 0, y: 4 } : { opacity: 0 }}
      animate={rise ? { opacity: 1, y: 0 } : { opacity: 1 }}
      transition={MOTION_FADE}
    >
      {children}
    </m.div>
  );
}
