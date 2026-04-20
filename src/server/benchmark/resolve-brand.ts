export type BrandRecord = {
  id: string;
  slug: string;
  canonicalName: string;
  aliases: string[];
};

export function resolveBrand(
  rawMention: string,
  brands: BrandRecord[],
  opts: { suggestedSlug?: string | null } = {},
): BrandRecord | null {
  const normalized = rawMention.trim().toLowerCase();
  if (!normalized) return null;

  if (opts.suggestedSlug) {
    const bySlug = brands.find((b) => b.slug === opts.suggestedSlug);
    if (bySlug) return bySlug;
  }

  for (const brand of brands) {
    if (brand.canonicalName.toLowerCase() === normalized) return brand;
    if (brand.aliases.some((a) => a.toLowerCase() === normalized)) return brand;
  }
  return null;
}
