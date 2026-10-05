import { test, expect, type Page } from "@playwright/test";

/**
 * The menu bar never overlaps at any width: it switches to the hamburger
 * layout as soon as the full desktop menu would not fit. Sweeps 1600px down to
 * 320px in 10px steps in every locale, asserting that no two menu items
 * intersect, nothing leaves the bar, and the layout collapses exactly once
 * (monotonically) on the way down.
 */

const ITEMS =
  "#brandHomeButton, nav.tabs [role='tab'], #knownTotal, #studyLanguageButtons, #localeSelect, #settingsButton, #logoutButton";

interface Box {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Bounding boxes of the visible menu items and of the bar. */
async function measureBar(
  page: Page,
): Promise<{ bar: Box; items: Box[]; tabsVisible: boolean }> {
  return page.evaluate((selector) => {
    const toBox = (element: Element, id: string) => {
      const rect = element.getBoundingClientRect();
      return {
        id,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    const bar = document.querySelector("#appShell > header") as HTMLElement;
    const items = [...document.querySelectorAll(selector)]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) =>
        toBox(
          element,
          element.getAttribute("data-tab") || element.id || element.tagName,
        ),
      );
    return {
      bar: toBox(bar, "bar"),
      items,
      tabsVisible: items.some((item) => item.id === "dashboard"),
    };
  }, ITEMS);
}

for (const locale of ["en", "ja", "zh"]) {
  test(`menu bar never overlaps while shrinking (${locale})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto("/dashboard");
    await expect(page.locator("#localeSelect")).toBeVisible();
    await page.locator("#localeSelect").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);

    let collapsedAt: number | null = null;
    for (let width = 1600; width >= 320; width -= 10) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(60);
      const { bar, items, tabsVisible } = await measureBar(page);
      if (!tabsVisible && collapsedAt === null) {
        collapsedAt = width;
      }
      if (collapsedAt !== null) {
        expect(
          tabsVisible,
          `tabs came back at ${width}px after collapsing at ${collapsedAt}px`,
        ).toBe(false);
      }
      for (const item of items) {
        expect(
          item.left,
          `${item.id} leaves the bar at ${width}px`,
        ).toBeGreaterThanOrEqual(bar.left - 0.5);
        expect(
          item.right,
          `${item.id} leaves the bar at ${width}px`,
        ).toBeLessThanOrEqual(bar.right + 0.5);
      }
      for (const [index, a] of items.entries()) {
        for (const b of items.slice(index + 1)) {
          const overlaps =
            a.left < b.right - 0.5 &&
            b.left < a.right - 0.5 &&
            a.top < b.bottom - 0.5 &&
            b.top < a.bottom - 0.5;
          expect(overlaps, `${a.id} overlaps ${b.id} at ${width}px`).toBe(
            false,
          );
        }
      }
    }
    expect(collapsedAt, "the menu collapses before 320px").not.toBeNull();
    console.log(`menubar ${locale}: hamburger from ${collapsedAt}px`);
  });
}
