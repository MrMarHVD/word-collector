import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { nextCollapsed, requiredMenuWidth } from "@/lib/menu-fit";

/** Pixel value of a computed-style length (0 for "normal"/empty). */
function px(value: string): number {
  return Number.parseFloat(value) || 0;
}

/** Natural (unshrunk) width of a tab list: its triggers' label widths plus their padding, the list's gaps, padding and border. */
function naturalTabsWidth(nav: HTMLElement): number {
  const listStyle = getComputedStyle(nav);
  const triggers = [...nav.querySelectorAll<HTMLElement>("[role='tab']")].filter((trigger) => trigger.getClientRects().length > 0);
  const range = document.createRange();
  const labels = triggers.reduce((sum, trigger) => {
    const style = getComputedStyle(trigger);
    range.selectNodeContents(trigger);
    return sum + range.getBoundingClientRect().width + px(style.paddingLeft) + px(style.paddingRight);
  }, 0);
  const chrome = px(listStyle.paddingLeft) + px(listStyle.paddingRight) + px(listStyle.borderLeftWidth) + px(listStyle.borderRightWidth);
  return labels + chrome + px(listStyle.columnGap) * Math.max(0, triggers.length - 1);
}

/** Measures the full desktop menu's required bar width from the live (uncollapsed) DOM. */
function measureRequiredWidth(bar: HTMLElement, end: HTMLElement): number {
  const barStyle = getComputedStyle(bar);
  const brand = bar.querySelector<HTMLElement>("#brandHomeButton");
  const nav = bar.querySelector<HTMLElement>("nav.tabs");
  const tabsShown = nav !== null && nav.getClientRects().length > 0;
  const group = brand?.parentElement;
  return requiredMenuWidth({
    padding: px(barStyle.paddingLeft) + px(barStyle.paddingRight),
    barGap: px(barStyle.columnGap),
    innerGap: group ? px(getComputedStyle(group).columnGap) : 0,
    brand: brand?.offsetWidth ?? 0,
    tabs: tabsShown ? naturalTabsWidth(nav) : 0,
    end: end.offsetWidth
  });
}

/**
 * Whether the menu bar must switch to its hamburger layout because the full
 * desktop menu no longer fits the bar. Each time `signature` changes (locale,
 * study languages, admin tab, known count...) or fonts finish loading, the
 * desktop layout is rendered for one pre-paint pass and re-measured; resizes
 * only compare the cached width with the bar width, with hysteresis. `enabled`
 * is false where the layout is not the desktop row (the mobile breakpoint,
 * guests). `end` is the bar's right-hand group.
 */
export function useMenuBarCollapse(bar: RefObject<HTMLElement | null>, end: RefObject<HTMLElement | null>, enabled: boolean, signature: string): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const [probing, setProbing] = useState(false);
  const required = useRef(0);

  const compare = useEffectEvent(() => {
    if (bar.current) {
      const available = bar.current.clientWidth;
      setCollapsed((previous) => nextCollapsed(previous, required.current, available));
    }
  });

  useLayoutEffect(() => {
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- renders the desktop layout once, pre-paint, so it can be re-measured
      setProbing(true);
    }
  }, [enabled, signature]);

  useLayoutEffect(() => {
    if (probing && bar.current && end.current) {
      required.current = measureRequiredWidth(bar.current, end.current);
      compare();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ends the measuring pass in the same pre-paint commit
      setProbing(false);
    }
  }, [probing, bar, end]);

  useEffect(() => {
    if (!enabled || !bar.current) {
      return;
    }
    const observer = new ResizeObserver(() => compare());
    observer.observe(bar.current);
    const reprobe = () => setProbing(true);
    document.fonts?.addEventListener("loadingdone", reprobe);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", reprobe);
    };
  }, [enabled, bar]);

  return enabled && collapsed && !probing;
}
