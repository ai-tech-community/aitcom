export type CategoryRef = { id: string; slug: string; name: string };

export type HeroRowRef = { categoryId: string; sharePct: number };

/**
 * Pick the category to default the hero to. Highest-sharePct wins;
 * alphabetical slug is the tie-break and the fallback when no rows exist.
 */
export function resolveDefaultCategory(
  categories: CategoryRef[],
  heroRows: HeroRowRef[],
): CategoryRef | null {
  if (categories.length === 0) return null;

  const byId = new Map(categories.map((c) => [c.id, c]));
  const validRows = heroRows.filter((r) => byId.has(r.categoryId));

  if (validRows.length > 0) {
    const best = validRows.reduce((a, b) => (b.sharePct > a.sharePct ? b : a));
    return byId.get(best.categoryId) ?? null;
  }

  return (
    [...categories].sort((a, b) => a.slug.localeCompare(b.slug))[0] ?? null
  );
}
