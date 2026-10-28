const PARKED_X = -1000;
const TRANSLATE =
  /translate\(\s*(-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\s*\)/;

/**
 * Lexical's draggable-block menu is `position: absolute; left: 0` and then
 * translated to the left of the hovered block, often by its own width. On a
 * narrow editor that puts the add button past the left edge of the screen.
 * A parked menu (`translate(-10000px, …)`, opacity 0) stays off-screen.
 *
 * The correction is a left margin, not a second transform, so it does not
 * fight the plugin's own positioning. Setting the same margin twice is a
 * no-op, so a style observer that calls this cannot loop.
 */
export function placeBlockMenu(
  menu: HTMLElement,
  anchor: HTMLElement,
  minLeft = 8,
): void {
  const match = TRANSLATE.exec(menu.style.transform ?? "");
  const parked =
    !match || menu.style.opacity === "0" || Number(match[1]) < PARKED_X;
  if (parked) {
    if (menu.style.marginLeft !== "" && menu.style.marginLeft !== "0px") {
      menu.style.marginLeft = "0px";
    }
    return;
  }
  const x = Number(match[1]);
  const anchorLeft = anchor.getBoundingClientRect().left;
  const needed = Math.max(0, minLeft - anchorLeft - x);
  const next = needed === 0 ? "0px" : `${needed}px`;
  if (menu.style.marginLeft !== next) menu.style.marginLeft = next;
}
