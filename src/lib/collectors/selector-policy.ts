import { parse, SelectorType, type Selector } from "css-what";

/**
 * Which CSS selectors a member may give the "list on a web page" collector.
 * Only features that css-select evaluates in linear time and without deep
 * recursion: the `:nth-*` family is quadratic in sibling count, `:has()` and
 * `:contains()` recurse and overflow the stack on deep pages (measured).
 * Used by the form schema and again inside the extraction worker.
 *
 * This is an allowlist: any token type or pseudo-class not named here is
 * refused, so a newer css-what that learns a new feature stays refused.
 */
export const MAX_SELECTOR_LENGTH = 200;
export const MAX_COMPOUNDS = 8;

export type SelectorProblem =
  | "empty"
  | "too_long"
  | "invalid"
  | "list"
  | "too_complex"
  | "not_allowed";

export type SelectorCheck =
  | { ok: true }
  | { ok: false; reason: SelectorProblem };

/** Pseudo-classes whose argument is a nested selector list. */
const SELECTOR_LIST_PSEUDOS: ReadonlySet<string> = new Set([
  "not",
  "is",
  "where",
]);

/** Pseudo-classes that take no argument. */
const BARE_PSEUDOS: ReadonlySet<string> = new Set([
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "empty",
]);

/** Combinators: descendant (space), `>`, `+`, `~`. Not `<` or `||`. */
const ALLOWED_COMBINATORS: ReadonlySet<Selector["type"]> = new Set([
  SelectorType.Descendant,
  SelectorType.Child,
  SelectorType.Adjacent,
  SelectorType.Sibling,
]);

/** Simple selectors: tag, `*`, and attribute (class and id are attributes). */
const ALLOWED_SIMPLE: ReadonlySet<Selector["type"]> = new Set([
  SelectorType.Tag,
  SelectorType.Universal,
  SelectorType.Attribute,
]);

/**
 * Checks one complex selector (no top-level list). Nested `:not/:is/:where`
 * selectors are checked with the same rules, including the compound limit.
 */
function checkComplex(tokens: Selector[]): SelectorProblem | null {
  let compounds = 1;
  for (const token of tokens) {
    if (ALLOWED_COMBINATORS.has(token.type)) {
      compounds += 1;
      continue;
    }
    if (ALLOWED_SIMPLE.has(token.type)) continue;
    if (token.type !== SelectorType.Pseudo) return "not_allowed";

    if (BARE_PSEUDOS.has(token.name)) {
      if (token.data !== null) return "not_allowed";
      continue;
    }
    if (SELECTOR_LIST_PSEUDOS.has(token.name) && Array.isArray(token.data)) {
      for (const inner of token.data) {
        const problem = checkComplex(inner);
        if (problem) return problem;
      }
      continue;
    }
    return "not_allowed";
  }
  return compounds > MAX_COMPOUNDS ? "too_complex" : null;
}

export function checkSelector(selector: string): SelectorCheck {
  const trimmed = selector.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (selector.length > MAX_SELECTOR_LENGTH)
    return { ok: false, reason: "too_long" };

  let parsed: Selector[][];
  try {
    parsed = parse(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const [only] = parsed;
  if (parsed.length !== 1 || !only || only.length === 0)
    return { ok: false, reason: "list" };

  const problem = checkComplex(only);
  return problem ? { ok: false, reason: problem } : { ok: true };
}
