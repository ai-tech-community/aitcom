export interface PrimaryCategoryInput {
  categoryIds: string[];
  mentionCountsByCategory: Record<string, number>;
}

export function resolvePrimaryCategory(
  input: PrimaryCategoryInput,
): string | null {
  const { categoryIds, mentionCountsByCategory } = input;
  const pool =
    categoryIds.length > 0 ? categoryIds : Object.keys(mentionCountsByCategory);
  if (pool.length === 0) return null;

  let best: string | null = null;
  let bestCount = -1;
  for (const candidate of pool) {
    const count = mentionCountsByCategory[candidate] ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
