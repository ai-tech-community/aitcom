/** The text-area styles that decide where a character lands. */
const MIRRORED = [
  "boxSizing",
  "width",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "letterSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "wordSpacing",
] as const;

/**
 * Where character `index` of a text area sits, in pixels from the text
 * area's top-left corner (scrolling included): the top and the height of
 * its line, and its left edge. Measured on an invisible copy of the text
 * area with the same text and wrapping, the usual way to find a caret.
 */
export function caretPosition(
  field: HTMLTextAreaElement,
  index: number,
): { top: number; left: number; height: number } {
  const style = window.getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const name of MIRRORED) mirror.style[name] = style[name];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.overflow = "hidden";
  mirror.textContent = field.value.slice(0, index);
  const marker = document.createElement("span");
  // Something to measure, even at the end of the text.
  marker.textContent = field.value.slice(index) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight =
    Number.parseFloat(style.lineHeight) ||
    Number.parseFloat(style.fontSize) * 1.4 ||
    20;
  const position = {
    top: marker.offsetTop - field.scrollTop,
    left: marker.offsetLeft - field.scrollLeft,
    height: lineHeight,
  };
  mirror.remove();
  return position;
}
