import { parse, SelectorType, type Selector } from "css-what";

/**
 * Which CSS selectors a member may give the "list on a web page" collector.
 * Used by the form schema and again inside the extraction worker.
 *
 * Allowed: tag, `*`, class, id and attribute selectors (no namespaces);
 * the combinators descendant (space), `>` and `+`; the pseudo-classes
 * `:not()`, `:is()`, `:where()` (single compound arguments only),
 * `:first-child`, `:last-child`, `:only-child`, `:first-of-type`,
 * `:last-of-type`, `:only-of-type` and `:empty`. One selector, at most
 * MAX_SELECTOR_LENGTH characters and MAX_COMPOUNDS compound parts.
 *
 * Everything else is refused, including what we measured as super-linear in
 * css-select (cheerio 1.2.0):
 * - the `:nth-*` family, and `:has()` / `:contains()` (they also recurse and
 *   overflow the stack on deep pages);
 * - the general sibling combinator `~`, anywhere. Its sibling scan is
 *   uncached: `x ~ * ~ * ~ *` took 19.8 s at 400 siblings,
 *   `:not(:only-of-type) ~ *` 13 s at 1 200 siblings, and even a single `~`
 *   after a descendant chain (`p * * * * * * ~ *`) costs siblings² × depth:
 *   4.3 s at 5 000 siblings and depth 15, 135 s at depth 512;
 * - more than two sibling-scanning pseudo-classes (15x `:only-of-type`
 *   took 6.1 s at 5 000 siblings);
 * - any combinator inside `:not()`, `:is()` or `:where()`: there css-select
 *   skips its descendant cache, so the cost is exponential in page depth
 *   (`:not(a div div div div div div div)` took 4.2 s at depth 40, 25 s at
 *   depth 50, over 60 s at 100). Their arguments must be single compound
 *   selectors such as `.ad`, `[hidden]` or `a.ad:first-child`.
 *
 * What remains can still be slow on a hostile page. Sibling-scanning
 * pseudo-classes stay quadratic in sibling count (about 0.9 s at 5 000
 * siblings with all different tag names), and a `+` that links such a
 * pseudo-class to a descendant part costs siblings² × depth
 * (`* + :only-of-type *` took 5.6 s at 5 000 siblings, each holding a
 * 15-deep chain). This policy is not the real bound; the real bound is the
 * extraction deadline, enforced from outside the worker.
 *
 * This is an allowlist: any token type or pseudo-class not named here is
 * refused, so a newer css-what that learns a new feature stays refused.
 */
export const MAX_SELECTOR_LENGTH = 200;
export const MAX_COMPOUNDS = 8;
/**
 * Sibling-scanning pseudo-classes allowed in the whole selector, nested ones
 * included.
 */
export const MAX_SIBLING_SCANNING_PSEUDOS = 2;

/** Pseudo-classes that css-select answers by scanning the sibling list. */
const SIBLING_SCANNING_PSEUDOS: ReadonlySet<string> = new Set([
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "only-child",
  "last-child",
]);

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
const BARE_PSEUDOS: ReadonlySet<string> = new Set([
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "empty",
]);

/** Combinators: descendant (space), `>`, `+`. Not `~`, `<` or `||`. */
const ALLOWED_COMBINATORS: ReadonlySet<Selector["type"]> = new Set([
  SelectorType.Descendant,
  SelectorType.Child,
  SelectorType.Adjacent,
]);

/** Counts shared by a selector and everything nested inside it. */
interface WholeSelectorTally {
  siblingScanningPseudos: number;
}

/**
 * Checks one token of a compound selector (anything but a combinator).
 * `:not/:is/:where` arguments are checked here too: each must be a single
 * compound selector, so a combinator inside them is refused.
 */
function checkCompoundToken(
  token: Selector,
  tally: WholeSelectorTally,
): SelectorProblem | null {
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

  if (BARE_PSEUDOS.has(token.name)) {
    if (token.data !== null) return "not_allowed";
    if (SIBLING_SCANNING_PSEUDOS.has(token.name))
      tally.siblingScanningPseudos += 1;
    return null;
  }
  if (SELECTOR_LIST_PSEUDOS.has(token.name) && Array.isArray(token.data)) {
    for (const compound of token.data) {
      for (const inner of compound) {
        if (ALLOWED_COMBINATORS.has(inner.type)) return "not_allowed";
        const problem = checkCompoundToken(inner, tally);
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
 * `checkCompoundToken` and is refused there. Sibling-scanning pseudo-classes
 * are counted into `tally` and judged once the walk is done.
 */
function checkComplex(
  tokens: Selector[],
  tally: WholeSelectorTally,
): SelectorProblem | null {
  let compounds = 1;
  for (const token of tokens) {
    if (ALLOWED_COMBINATORS.has(token.type)) {
      compounds += 1;
      continue;
    }
    const problem = checkCompoundToken(token, tally);
    if (problem) return problem;
  }
  return compounds > MAX_COMPOUNDS ? "too_complex" : null;
}

function checkTally(tally: WholeSelectorTally): SelectorProblem | null {
  return tally.siblingScanningPseudos > MAX_SIBLING_SCANNING_PSEUDOS
    ? "too_complex"
    : null;
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

  const tally: WholeSelectorTally = { siblingScanningPseudos: 0 };
  const problem = checkComplex(only, tally) ?? checkTally(tally);
  return problem ? { ok: false, reason: problem } : { ok: true };
}
