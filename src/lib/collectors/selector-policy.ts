import { parse, SelectorType, type Selector } from "css-what";

/**
 * Which CSS selectors a member may give the "list on a web page" collector.
 * Used by the form schema and again inside the extraction worker.
 *
 * The policy refuses the feature combinations we measured as super-linear
 * in css-select (cheerio 1.2.0):
 * - the `:nth-*` family, and `:has()` / `:contains()` (they also recurse and
 *   overflow the stack on deep pages);
 * - more than one `~` (the sibling scan is uncached: `x ~ * ~ * ~ *` took
 *   1.2 s at 200 siblings, 19.8 s at 400);
 * - a `~` together with any sibling-scanning pseudo-class
 *   (`:not(:only-of-type) ~ *` took 13 s at 1 200 siblings);
 * - more than two sibling-scanning pseudo-classes (15x `:only-of-type`
 *   took 6.1 s at 5 000 siblings).
 *
 * What remains can still be slow on a hostile page (two sibling-scanning
 * pseudo-classes stay quadratic: about 0.9 s at 5 000 siblings with all
 * different tag names). This policy is not the real bound; the real bound is
 * the extraction deadline, enforced from outside the worker.
 *
 * This is an allowlist: any token type or pseudo-class not named here is
 * refused, so a newer css-what that learns a new feature stays refused.
 */
export const MAX_SELECTOR_LENGTH = 200;
export const MAX_COMPOUNDS = 8;
/** `~` combinators allowed in the whole selector, nested ones included. */
export const MAX_GENERAL_SIBLING_COMBINATORS = 1;
/**
 * Sibling-scanning pseudo-classes allowed in the whole selector, nested ones
 * included, when it has no `~`. With a `~` anywhere, none are allowed.
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
  siblingScanningPseudos: number;
}

/**
 * Checks one complex selector (no top-level list). Nested `:not/:is/:where`
 * selectors are checked with the same rules. The compound limit applies to
 * each of them; the whole-selector counts go into `tally` and are judged by
 * `checkTally` once the walk is done.
 */
function checkComplex(
  tokens: Selector[],
  tally: WholeSelectorTally,
): SelectorProblem | null {
  let compounds = 1;
  for (const token of tokens) {
    if (ALLOWED_COMBINATORS.has(token.type)) {
      compounds += 1;
      if (token.type === SelectorType.Sibling) tally.generalSiblings += 1;
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
      if (SIBLING_SCANNING_PSEUDOS.has(token.name))
        tally.siblingScanningPseudos += 1;
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

function checkTally(tally: WholeSelectorTally): SelectorProblem | null {
  if (tally.generalSiblings > MAX_GENERAL_SIBLING_COMBINATORS)
    return "too_complex";
  if (tally.generalSiblings > 0 && tally.siblingScanningPseudos > 0)
    return "too_complex";
  if (tally.siblingScanningPseudos > MAX_SIBLING_SCANNING_PSEUDOS)
    return "too_complex";
  return null;
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

  const tally: WholeSelectorTally = {
    generalSiblings: 0,
    siblingScanningPseudos: 0,
  };
  const problem = checkComplex(only, tally) ?? checkTally(tally);
  return problem ? { ok: false, reason: problem } : { ok: true };
}
