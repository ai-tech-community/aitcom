/**
 * How a jobs search reads what the user typed. A leaf module: both the URL
 * builder (`startups.ts`) and the jobs query logic (`startup-roles.ts`) need
 * it, and `startup-roles.ts` already imports `startups.ts`.
 */

/** Longest search term kept; longer input is noise, not a word. */
const STARTUP_ROLE_SEARCH_TERM_MAX = 64;

/** More terms than this only narrow an already-empty result. */
const STARTUP_ROLE_SEARCH_TERMS_MAX = 8;

/**
 * Words of a jobs search, lowercased. Only letters and digits survive, so a
 * term can never carry tsquery syntax (`&`, `|`, `!`, `:`, parentheses).
 */
export function startupRoleSearchTerms(q: string): string[] {
  const terms: string[] = [];
  for (const match of q.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const term = match[0].slice(0, STARTUP_ROLE_SEARCH_TERM_MAX);
    if (!terms.includes(term)) terms.push(term);
    if (terms.length === STARTUP_ROLE_SEARCH_TERMS_MAX) break;
  }
  return terms;
}

/**
 * Shorter words match only as whole words: as prefixes, "c" or "go" would
 * match most of the catalog.
 */
export const STARTUP_ROLE_SEARCH_PREFIX_MIN = 3;

export type StartupRoleSearchTerm = { term: string; prefix: boolean };

/**
 * How each word of a jobs search matches: every word must match, and a word
 * long enough also matches as a prefix, so results follow the user while
 * they type ("engin" finds "engineering").
 */
export function startupRoleSearchPlan(q: string): StartupRoleSearchTerm[] {
  return startupRoleSearchTerms(q).map((term) => ({
    term,
    prefix: term.length >= STARTUP_ROLE_SEARCH_PREFIX_MIN,
  }));
}

/** True when `q` has at least one word to search for. */
export function hasStartupJobsSearch(q: string): boolean {
  return startupRoleSearchTerms(q).length > 0;
}

/**
 * The jobs order used when the user has not picked one: best match while
 * searching, otherwise company A–Z (which groups each company's roles).
 */
export function defaultStartupJobsSort(q: string): "match" | "company" {
  return hasStartupJobsSearch(q) ? "match" : "company";
}
