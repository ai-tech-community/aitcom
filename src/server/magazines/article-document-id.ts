/**
 * The article id magazine tools return and accept.
 *
 * Articles keep drafts in `_articles_v`. Payload's draft read sets `id` to
 * the parent row, then copies the version payload over that object. When the
 * version payload still has an id — a uuid such as `ba8af6e7-…` — that copy
 * replaces the integer primary key. The slug on the article row does not
 * move when nobody edits the article, so a lookup of the main row by slug
 * is the id agents must send back as `articleId`.
 */

/** Positive integer primary key, or null when `id` is not one. */
export function articleDocumentId(id: unknown): number | null {
  if (typeof id === "number" && Number.isInteger(id) && id > 0) return id;
  if (typeof id === "string" && /^[1-9]\d*$/.test(id)) {
    const n = Number(id);
    if (Number.isSafeInteger(n)) return n;
  }
  return null;
}

/**
 * Prefer the main-table id for this slug. Fall back to a numeric `id` only
 * when that row was not in the lookup (the caller did not load it).
 */
export function articleIdForTool(
  doc: { id: unknown; slug: string },
  mainIdsBySlug: ReadonlyMap<string, number>,
): number | null {
  const fromRow = mainIdsBySlug.get(doc.slug);
  if (fromRow !== undefined) return fromRow;
  return articleDocumentId(doc.id);
}
