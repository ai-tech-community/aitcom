/**
 * The light formatting a feed post may use, written in plain text so it
 * reads fine anywhere (agents, MCP, email): **bold**, _italic_ (or
 * *italic*), and lines starting with "- " or "1. " as lists. Parsed into
 * plain data; the UI renders it as elements, so no member markup ever
 * reaches the DOM. Links are found first and never split, so formatting
 * can wrap a whole link but never cut one.
 */

import { splitTextIntoLinks } from "./links";

export type Inline = { text: string; bold?: boolean; italic?: boolean };
export type Line = Inline[];
export type Block =
  | { kind: "text"; lines: Line[] }
  | { kind: "bullets"; items: Line[] }
  | { kind: "numbers"; start: number; items: Line[] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const LIST_MARK = /^\s*(?:[-*•]|\d{1,3}[.)])\s+/;

/**
 * **bold**, _italic_ and *italic*: a mark must hug a non-space character on
 * the inside and not touch a letter, digit or another mark on the outside,
 * so snake_case names, x**2 in code and stray stars stay as they are.
 */
const INLINE = new RegExp(
  [
    String.raw`(?<![\p{L}\p{N}*])\*\*(?=[^\s*])([^\n]+?)(?<=[^\s*])\*\*(?![\p{L}\p{N}*])`,
    String.raw`(?<![\p{L}\p{N}_])_(?=[^\s_])([^\n_]+?)(?<=[^\s_])_(?![\p{L}\p{N}_])`,
    String.raw`(?<![\p{L}\p{N}*])\*(?=[^\s*])([^\n*]+?)(?<=[^\s*])\*(?![\p{L}\p{N}*])`,
  ].join("|"),
  "gu",
);

/** Stands in for each character of a link while marks are matched. */
const LINK_MASK = "";

function maskLinks(text: string): string {
  return splitTextIntoLinks(text)
    .map((segment) =>
      segment.kind === "link"
        ? LINK_MASK.repeat(segment.text.length)
        : segment.text,
    )
    .join("");
}

function parseRange(
  text: string,
  masked: string,
  style: Omit<Inline, "text">,
): Line {
  const parts: Line = [];
  let at = 0;
  for (const match of masked.matchAll(INLINE)) {
    const index = match.index;
    if (index > at) parts.push({ ...style, text: text.slice(at, index) });
    const [whole, bold, underscored, starred] = match;
    const mark = bold !== undefined ? 2 : 1;
    const inner = [index + mark, index + whole.length - mark] as const;
    const innerStyle =
      bold !== undefined
        ? { ...style, bold: true }
        : underscored !== undefined || starred !== undefined
          ? { ...style, italic: true }
          : style;
    // One level of the other style inside (italic in bold, bold in italic).
    parts.push(
      ...parseRange(text.slice(...inner), masked.slice(...inner), innerStyle),
    );
    at = index + whole.length;
  }
  if (at < text.length) parts.push({ ...style, text: text.slice(at) });
  return parts;
}

export function parseInline(line: string): Line {
  return parseRange(line, maskLinks(line), {});
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
    } else if (raw.trim() === "" && last) {
      // The gap after a list is the space between blocks already.
      continue;
    } else {
      blocks.push({ kind: "text", lines: [parseInline(raw)] });
    }
  }
  return blocks;
}

/** A post's text with its formatting marks taken out (Reels captions). */
export function plainPostText(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      parseInline(line)
        .map((part) => part.text)
        .join(""),
    )
    .join("\n");
}

/** A selection in a text, and the text after an edit with the new one. */
export type TextEdit = { value: string; start: number; end: number };

const WORD = /[\p{L}\p{N}_*]/u;

/** The edges of the word around `at` (letters, digits and marks). */
function wordAround(value: string, at: number): [number, number] {
  let start = at;
  let end = at;
  while (start > 0 && WORD.test(value[start - 1]!)) start--;
  while (end < value.length && WORD.test(value[end]!)) end++;
  return [start, end];
}

function wrapOne(
  value: string,
  start: number,
  end: number,
  marker: string,
): TextEdit {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  // The marks just outside the selection, or inside it: unwrap.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      value:
        before.slice(0, -marker.length) + selected + after.slice(marker.length),
      start: start - marker.length,
      end: end - marker.length,
    };
  }
  if (
    selected.length > marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const inner = selected.slice(marker.length, -marker.length);
    return {
      value: before + inner + after,
      start,
      end: start + inner.length,
    };
  }
  return {
    value: before + marker + selected + marker + after,
    start: start + marker.length,
    end: end + marker.length,
  };
}

/**
 * Toggles a mark (** or _) on the selection, the way a formatting button
 * should: it unwraps text already marked (marks inside or just outside the
 * selection, or the word the caret sits in), keeps spaces at the edges
 * outside the marks, widens a part of a word to the whole word (marks
 * inside a word would not show), and marks each line of a selection over
 * several lines on its own. With nothing selected outside a word it places
 * a pair with the caret between.
 */
export function toggleWrap(
  value: string,
  start: number,
  end: number,
  marker: string,
): TextEdit {
  if (start === end) {
    const [from, to] = wordAround(value, start);
    if (from === to) return wrapOne(value, start, end, marker);
    const word = value.slice(from, to);
    if (word.startsWith(marker) && word.endsWith(marker)) {
      const edit = wrapOne(value, from, to, marker);
      const caret = Math.max(edit.start, start - marker.length);
      return { ...edit, start: caret, end: caret };
    }
    return wrapOne(value, from, to, marker);
  }
  const selected = value.slice(start, end);
  if (selected.includes("\n")) {
    let next = value.slice(0, start);
    const lines = selected.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) next += "\n";
      const trimmed = line.trim();
      if (!trimmed) {
        next += line;
        return;
      }
      const lead = line.length - line.trimStart().length;
      next += wrapOne(line, lead, lead + trimmed.length, marker).value;
    });
    const block = next.slice(start);
    return {
      value: next + value.slice(end),
      start,
      end: start + block.length,
    };
  }
  // Spaces at the edges stay outside the marks.
  let from = start + (selected.length - selected.trimStart().length);
  let to = end - (selected.length - selected.trimEnd().length);
  if (from >= to) return wrapOne(value, start, end, marker);
  // A part of a word grows to the whole word.
  if (from > 0 && WORD.test(value[from - 1]!) && WORD.test(value[from]!)) {
    from = wordAround(value, from)[0];
  }
  if (to < value.length && WORD.test(value[to]!) && WORD.test(value[to - 1]!)) {
    to = wordAround(value, to)[1];
  }
  return wrapOne(value, from, to, marker);
}

/**
 * Toggles a list on the lines the selection touches: removes it when
 * every line already has it, otherwise makes them "- " (bullets) or "1. ",
 * "2. " (numbers). Empty lines stay empty. A selection that ends at the
 * start of a line does not take that line. The selection then covers the
 * lines.
 */
export function toggleList(
  value: string,
  start: number,
  end: number,
  kind: "bullets" | "numbers",
): TextEdit {
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const from = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const toBreak = value.indexOf("\n", last);
  const to = toBreak === -1 ? value.length : toBreak;
  const lines = value.slice(from, to).split("\n");
  const pattern = kind === "bullets" ? BULLET : NUMBER;
  const filled = lines.filter((line) => line.trim() !== "");
  const all = filled.length > 0 && filled.every((line) => pattern.test(line));
  let number = 0;
  const next = lines.map((line) => {
    if (line.trim() === "") return line;
    const bare = line.replace(LIST_MARK, "");
    if (all) return bare;
    number += 1;
    return `${kind === "bullets" ? "- " : `${number}. `}${bare}`;
  });
  const block = next.join("\n");
  return {
    value: value.slice(0, from) + block + value.slice(to),
    start: from,
    end: from + block.length,
  };
}
