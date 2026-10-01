import type { ReactNode } from "react";
import { m } from "motion/react";
import { MOTION_FADE } from "@/lib/motion";

/**
 * Mount fade with a 4px rise for content that appears (tab panels, routed
 * pages, list rows). Opacity and translate only, so layout and reduced-motion
 * policy are handled by the app-wide MotionConfig.
 */
export function FadeIn({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <m.div className={className} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOTION_FADE, delay }}>
      {children}
    </m.div>
  );
}
