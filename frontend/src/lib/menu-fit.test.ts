import { describe, expect, it } from "vitest";
import { MENU_EXPAND_HYSTERESIS, nextCollapsed, requiredMenuWidth } from "@/lib/menu-fit";

describe("requiredMenuWidth", () => {
  const base = { padding: 40, barGap: 12, innerGap: 16, brand: 100, tabs: 400, end: 300 };

  it("sums every part including the gaps", () => {
    expect(requiredMenuWidth(base)).toBe(40 + 100 + 16 + 400 + 12 + 300);
  });

  it("drops the tabs and their gap when the tabs are not shown", () => {
    expect(requiredMenuWidth({ ...base, tabs: 0 })).toBe(40 + 100 + 12 + 300);
  });
});

describe("nextCollapsed", () => {
  it("collapses once the bar is narrower than required", () => {
    expect(nextCollapsed(false, 800, 799)).toBe(true);
    expect(nextCollapsed(false, 800, 800)).toBe(false);
  });

  it("stays collapsed until the hysteresis margin is available", () => {
    expect(nextCollapsed(true, 800, 800 + MENU_EXPAND_HYSTERESIS - 1)).toBe(true);
    expect(nextCollapsed(true, 800, 800 + MENU_EXPAND_HYSTERESIS)).toBe(false);
  });
});
