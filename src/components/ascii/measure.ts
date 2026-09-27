/**
 * Layout measurement for ASCII scenes. Called only on mount, resize and font
 * load — never per animation frame.
 */

export interface CharCell {
  width: number;
  height: number;
}

export interface GridSize {
  cols: number;
  rows: number;
}

/** Cell rectangle in grid coordinates. */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PROBE_LENGTH = 40;

/**
 * Size of one monospace character cell inside `el`, measured with a probe
 * that inherits the element's font. Falls back to Geist Mono at 12px.
 */
export function measureCharCell(el: HTMLElement): CharCell {
  const probe = document.createElement("span");
  probe.textContent = "M".repeat(PROBE_LENGTH);
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:absolute;visibility:hidden;white-space:pre;left:0;top:0;line-height:inherit;";
  el.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  el.removeChild(probe);
  const width = rect.width / PROBE_LENGTH;
  const height = rect.height;
  if (!(width > 0) || !(height > 0)) return { width: 7.2, height: 14 };
  return { width, height };
}

export function gridSizeFor(
  box: { width: number; height: number },
  cell: CharCell,
): GridSize {
  return {
    cols: Math.max(0, Math.floor(box.width / cell.width)),
    rows: Math.max(0, Math.floor(box.height / cell.height)),
  };
}

/**
 * The part of `inner` that overlaps `outer`, converted to grid cells relative
 * to `outer`'s top-left corner and grown by `padCells`. Null when the two
 * boxes do not overlap (e.g. on mobile, where the scene sits below the text).
 */
export function overlapInCells(
  outer: DOMRectReadOnly,
  inner: DOMRectReadOnly,
  cell: CharCell,
  padCells = 0,
): CellRect | null {
  const left = Math.max(outer.left, inner.left);
  const top = Math.max(outer.top, inner.top);
  const right = Math.min(outer.right, inner.right);
  const bottom = Math.min(outer.bottom, inner.bottom);
  if (right <= left || bottom <= top) return null;
  const x = Math.floor((left - outer.left) / cell.width) - padCells;
  const y = Math.floor((top - outer.top) / cell.height) - padCells;
  const x2 = Math.ceil((right - outer.left) / cell.width) + padCells;
  const y2 = Math.ceil((bottom - outer.top) / cell.height) + padCells;
  return { x, y, w: x2 - x, h: y2 - y };
}
