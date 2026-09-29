import { describe, expect, it } from "vitest";
import { createWheelPageTurnTracker, swipePageDirection } from "./page-turn-gestures";
import { closestQuickMenuAction, quickMenuOrigin, READER_MENU_RADIUS, READER_MENU_MARGIN } from "./quick-menu";

describe("createWheelPageTurnTracker", () => {
  it("leaves vertical-dominant wheel events to the browser", () => {
    const track = createWheelPageTurnTracker();
    expect(track({ deltaX: 10, deltaY: 20, timeStamp: 0 })).toBe("ignore");
  });

  it("turns one page per gesture once the horizontal distance passes the threshold", () => {
    const track = createWheelPageTurnTracker();
    expect(track({ deltaX: 50, deltaY: 0, timeStamp: 1000 })).toBeNull();
    expect(track({ deltaX: 40, deltaY: 0, timeStamp: 1020 })).toBe("next");
    // The momentum tail of the same stream is ignored.
    expect(track({ deltaX: 200, deltaY: 0, timeStamp: 1040 })).toBeNull();
    // A quiet gap ends the gesture; the next one can turn again.
    expect(track({ deltaX: -90, deltaY: 0, timeStamp: 1200 })).toBe("prev");
  });

  it("restarts the distance after a quiet gap", () => {
    const track = createWheelPageTurnTracker();
    expect(track({ deltaX: 70, deltaY: 0, timeStamp: 1000 })).toBeNull();
    expect(track({ deltaX: 70, deltaY: 0, timeStamp: 1200 })).toBeNull();
  });
});

describe("swipePageDirection", () => {
  it("turns forward on a left swipe and back on a right swipe", () => {
    expect(swipePageDirection(-80, 10)).toBe("next");
    expect(swipePageDirection(80, 10)).toBe("prev");
  });

  it("ignores taps and vertical-dominant drags", () => {
    expect(swipePageDirection(-30, 0)).toBeNull();
    expect(swipePageDirection(-80, 90)).toBeNull();
  });
});

describe("quick menu geometry", () => {
  it("keeps the menu centre far enough from the viewport edges", () => {
    const edge = READER_MENU_RADIUS + READER_MENU_MARGIN;
    expect(quickMenuOrigin({ x: 5, y: 5 }, { width: 400, height: 800 })).toEqual({ x: edge, y: edge });
    expect(quickMenuOrigin({ x: 395, y: 400 }, { width: 400, height: 800 })).toEqual({ x: 400 - edge, y: 400 });
  });

  it("selects nothing near the centre and the nearest option further out", () => {
    const origin = { x: 200, y: 200 };
    expect(closestQuickMenuAction(origin, { x: 220, y: 210 })).toBeNull();
    expect(closestQuickMenuAction(origin, { x: 200, y: 120 })?.key).toBe("unknown");
    expect(closestQuickMenuAction(origin, { x: 120, y: 200 })?.key).toBe("learning");
    expect(closestQuickMenuAction(origin, { x: 290, y: 190 })?.key).toBe("known");
    expect(closestQuickMenuAction(origin, { x: 205, y: 290 })?.key).toBe("practice");
  });
});
