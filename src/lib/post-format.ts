/**
 * The light formatting a feed post may use, written in plain text so it
 * reads fine anywhere (agents, MCP, email): **bold**, _italic_, and lines
 * starting with "- " or "1. " as lists. Parsed into plain data; the UI
 * renders it as elements, so no member markup ever reaches the DOM.
 */

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Line = Inline[];
export type Block =
  | { kind: "text"; lines: Line[] }
  | { kind: "bullets"; items: Line[] }
  | { kind: "numbers"; start: number; items: Line[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d{1,3})[.)]\s+(.*)$/;

/**
 * **bold** and _italic_: the marker must hug a non-space character on the
 * inside and not touch a letter or digit on the outside, so snake_case
 * names, file_names and underscores inside links stay as they are.
 */
const INLINE =
  /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*|(?<![\p{L}\p{N}_])_(?=\S)([^_\n]+?)(?<=\S)_(?![\p{L}\p{N}_])/gu;

export function parseInline(
  line: string,
  style: Omit<Inline, "text"> = {},
): Line {
  const parts: Line = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    const index = match.index;
    if (index > at) parts.push({ ...style, text: line.slice(at, index) });
    if (match[1] !== undefined) {
      // Italic inside bold, one level deep.
      parts.push(...parseInline(match[1], { ...style, bold: true }));
    } else if (match[2] !== undefined) {
      parts.push({ ...style, italic: true, text: match[2] });
    }
    at = index + match[0].length;
  }
  if (at < line.length) parts.push({ ...style, text: line.slice(at) });
  return parts;
}

/** A post's text as blocks: paragraphs (kept line by line) and lists. */
export function parsePostText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const bullet = BULLET.exec(raw);
    const number = bullet ? null : NUMBER.exec(raw);
    const last = blocks.at(-1);
    if (bullet) {
      const item = parseInline(bullet[1]!);
      if (last?.kind === "bullets") last.items.push(item);
      else blocks.push({ kind: "bullets", items: [item] });
    } else if (number) {
      const item = parseInline(number[2]!);
      if (last?.kind === "numbers") last.items.push(item);
      else
        blocks.push({
          kind: "numbers",
          start: Number(number[1]),
          items: [item],
        });
    } else if (last?.kind === "text") {
      last.lines.push(parseInline(raw));
    } else {
      blocks.push({ kind: "text", lines: [parseInline(raw)] });
    }
  }
  return blocks;
}

/** A selection in a text, and the text after an edit with the new one. */
export type TextEdit = { value: string; start: number; end: number };

/**
 * Toggles a marker (** or _) around the selection: wraps it, or unwraps it
 * when it is already wrapped. With nothing selected it places a pair and
 * puts the caret between them.
 */
export function toggleWrap(
  value: string,
  start: number,
  end: number,
  marker: string,
): TextEdit {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value:
        before.slice(0, -marker.length) + selected + after.slice(marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  return {
    value: before + marker + selected + marker + after,
    start: start + marker.length,
    end: end + marker.length,
  };
}

/**
 * Toggles a list on the lines the selection touches: removes it when
 * every line already has it, otherwise makes them all "- " (bullets) or
 * "1. ", "2. " (numbers). The selection then covers those lines.
 */
export function toggleList(
  value: string,
  start: number,
  end: number,
  kind: "bullets" | "numbers",
): TextEdit {
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const toBreak = value.indexOf("\n", end);
  const to = toBreak === -1 ? value.length : toBreak;
  const lines = value.slice(from, to).split("\n");
  const pattern = kind === "bullets" ? BULLET : NUMBER;
  const bare = (line: string) =>
    line.replace(/^\s*(?:[-*•]|\d{1,3}[.)])\s+/, "");
  const all = lines.every((line) => pattern.test(line));
  const next = lines.map((line, i) =>
    all
      ? bare(line)
      : `${kind === "bullets" ? "- " : `${i + 1}. `}${bare(line)}`,
  );
  const block = next.join("\n");
  return {
    value: value.slice(0, from) + block + value.slice(to),
    start: from,
    end: from + block.length,
  };
}
