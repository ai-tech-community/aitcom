import { describe, expect, it } from "vitest";

import { placeBlockMenu } from "./block-menu-position";

function rect(left: number): DOMRect {
  return {
    x: left,
    y: 0,
    left,
    top: 0,
    right: left,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {
      return {};
    },
  };
}

describe("placeBlockMenu", () => {
  it("pulls an add button that sits past the left edge back into view", () => {
    const anchor = document.createElement("div");
    const menu = document.createElement("div");
    anchor.getBoundingClientRect = () => rect(16);
    menu.style.opacity = "1";
    menu.style.transform = "translate(-40px, 12px)";

    placeBlockMenu(menu, anchor);

    // 8px minimum inset − anchor left 16 − translate −40 = 32.
    expect(menu.style.marginLeft).toBe("32px");
    expect(menu.style.transform).toBe("translate(-40px, 12px)");
    placeBlockMenu(menu, anchor);
    expect(menu.style.marginLeft).toBe("32px");
  });

  it("leaves a menu that is already in view, and a parked menu, alone", () => {
    const anchor = document.createElement("div");
    const menu = document.createElement("div");
    anchor.getBoundingClientRect = () => rect(80);
    menu.style.opacity = "1";
    menu.style.transform = "translate(12px, 4px)";
    placeBlockMenu(menu, anchor);
    expect(menu.style.marginLeft).toBe("0px");

    menu.style.opacity = "0";
    menu.style.transform = "translate(-10000px, -10000px)";
    menu.style.marginLeft = "32px";
    placeBlockMenu(menu, anchor);
    expect(menu.style.marginLeft).toBe("0px");
  });
});
