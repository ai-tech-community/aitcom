import { parse, SelectorType, type Selector } from "css-what";

/**
 * Which CSS selectors a member may give the "list on a web page" collector.
 * Only features whose css-select cost is bounded (at worst quadratic in the
 * sibling count) and that do not recurse deeply. Refused, all measured:
 * the `:nth-*` family, `:has()` and `:contains()` (recurse and overflow the
 * stack on deep pages), and chained `~` (the sibling scan is uncached, so
 * `x ~ * ~ * ~ *` grows polynomially: 1.2 s at 200 siblings, 19.8 s at 400).
 * The extraction also runs under a deadline enforced from outside the
 * worker; this policy keeps a single page well inside it.
 * Used by the form schema and again inside the extraction worker.
 *
 * This is an allowlist: any token type or pseudo-class not named here is
 * refused, so a newer css-what that learns a new feature stays refused.
 */
export const MAX_SELECTOR_LENGTH = 200;
export const MAX_COMPOUNDS = 8;
/** `~` combinators allowed in the whole selector, nested ones included. */
export const MAX_GENERAL_SIBLING_COMBINATORS = 1;

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

/** Counts shared by a selector and everything nested inside it. */
interface WholeSelectorTally {
  generalSiblings: number;
}

/**
 * Checks one complex selector (no top-level list). Nested `:not/:is/:where`
 * selectors are checked with the same rules: the compound limit applies to
 * each of them, the `~` limit to the whole selector (via `tally`).
 */
function checkComplex(
  tokens: Selector[],
  tally: WholeSelectorTally,
): SelectorProblem | null {
  let compounds = 1;
  for (const token of tokens) {
    if (ALLOWED_COMBINATORS.has(token.type)) {
      compounds += 1;
      if (token.type === SelectorType.Sibling) {
        tally.generalSiblings += 1;
        if (tally.generalSiblings > MAX_GENERAL_SIBLING_COMBINATORS)
          return "too_complex";
      }
      continue;
    }
    // Simple selectors: tag, `*`, attribute (class and id are attributes).
    if (
      token.type === SelectorType.Tag ||
      token.type === SelectorType.Universal ||
      token.type === SelectorType.Attribute
    ) {
      // Namespaced names (`svg|rect`, `*|rect`, `|rect`, `[xlink|href]`)
      // are refused: members never need them and they widen what we check.
      if (token.namespace !== null && token.namespace !== undefined)
        return "not_allowed";
      continue;
    }
    if (token.type !== SelectorType.Pseudo) return "not_allowed";

    if (BARE_PSEUDOS.has(token.name)) {
      if (token.data !== null) return "not_allowed";
      continue;
    }
    if (SELECTOR_LIST_PSEUDOS.has(token.name) && Array.isArray(token.data)) {
      for (const inner of token.data) {
        const problem = checkComplex(inner, tally);
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

  // css-what throws on empty parts ("li,", ","), so `only.length === 0`
  // cannot happen today; it stays as a guard against a parser change.
  const [only] = parsed;
  if (parsed.length !== 1 || !only || only.length === 0)
    return { ok: false, reason: "list" };

  const problem = checkComplex(only, { generalSiblings: 0 });
  return problem ? { ok: false, reason: problem } : { ok: true };
}
