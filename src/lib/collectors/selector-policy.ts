import { parse, SelectorType, type Selector } from "css-what";

/**
 * Which CSS selectors a member may give the "list on a web page" collector.
 * Used by the form schema and again inside the extraction worker.
 *
 * Allowed: tag, `*`, class, id and attribute selectors (no namespaces);
 * the combinators descendant (space), `>` and `+`; the pseudo-classes
 * `:not()`, `:is()`, `:where()` (single compound arguments only, such as
 * `.ad`, `[hidden]` or `a.ad:first-child`), `:first-child` and `:empty`.
 * One selector, at most MAX_SELECTOR_LENGTH characters and MAX_COMPOUNDS
 * compound parts.
 *
 * Everything else is refused. Measured reasons in css-select (cheerio 1.2.0):
 * - `:nth-*`: quadratic in sibling count.
 * - `:has()` / `:contains()`: recurse and overflow the stack on deep pages.
 * - `~`: uncached sibling scan; `p * * * * * * ~ *` took 4.3 s at 5 000
 *   siblings and depth 15, 135 s at depth 512.
 * - `:first-of-type`, `:last-of-type`, `:only-of-type`, `:only-child`,
 *   `:last-child`: they scan the sibling list; `* + :only-of-type *` took
 *   5.6 s at 5 000 siblings each holding a 15-deep chain.
 * - a combinator inside `:not()`, `:is()` or `:where()`: no descendant cache
 *   there; `:not(a div div div div div div div)` took 25 s at depth 50.
 *
 * This policy is not the real bound: the deadline enforced from outside the
 * worker is the real bound.
 *
 * This is an allowlist: any token type or pseudo-class not named here is
 * refused, so a newer css-what that learns a new feature stays refused.
 */
export const MAX_SELECTOR_LENGTH = 200;
export const MAX_COMPOUNDS = 8;

/** Why a selector was refused. A runtime list, so a code can be checked. */
export const SELECTOR_PROBLEMS = [
  "empty",
  "too_long",
  "invalid",
  "list",
  "too_complex",
  "not_allowed",
] as const;

export type SelectorProblem = (typeof SELECTOR_PROBLEMS)[number];

export type SelectorCheck =
  | { ok: true }
  | { ok: false; reason: SelectorProblem };

/**
 * Pseudo-classes whose argument is a list of compound selectors (no
 * combinators inside).
 */
const SELECTOR_LIST_PSEUDOS: ReadonlySet<string> = new Set([
  "not",
  "is",
  "where",
]);

/** Pseudo-classes that take no argument. */
const BARE_PSEUDOS: ReadonlySet<string> = new Set(["first-child", "empty"]);

/** Combinators: descendant (space), `>`, `+`. Not `~`, `<` or `||`. */
const ALLOWED_COMBINATORS: ReadonlySet<Selector["type"]> = new Set([
  SelectorType.Descendant,
  SelectorType.Child,
  SelectorType.Adjacent,
]);

/**
 * Checks one token of a compound selector (anything but a combinator).
 * `:not/:is/:where` arguments are checked here too: each must be a single
 * compound selector, so a combinator inside them is refused.
 */
function checkCompoundToken(token: Selector): SelectorProblem | null {
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
    return null;
  }
  if (token.type !== SelectorType.Pseudo) return "not_allowed";

  if (BARE_PSEUDOS.has(token.name))
    return token.data === null ? null : "not_allowed";
  if (SELECTOR_LIST_PSEUDOS.has(token.name) && Array.isArray(token.data)) {
    for (const compound of token.data) {
      for (const inner of compound) {
        if (ALLOWED_COMBINATORS.has(inner.type)) return "not_allowed";
        const problem = checkCompoundToken(inner);
        if (problem) return problem;
      }
    }
    return null;
  }
  return "not_allowed";
}

/**
 * Checks one complex selector (no top-level list): compounds joined by the
 * allowed combinators. Any other combinator (`~`, `<`, `||`) reaches
 * `checkCompoundToken` and is refused there.
 */
function checkComplex(tokens: Selector[]): SelectorProblem | null {
  let compounds = 1;
  for (const token of tokens) {
    if (ALLOWED_COMBINATORS.has(token.type)) {
      compounds += 1;
      continue;
    }
    const problem = checkCompoundToken(token);
    if (problem) return problem;
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

  const problem = checkComplex(only);
  return problem ? { ok: false, reason: problem } : { ok: true };
}
