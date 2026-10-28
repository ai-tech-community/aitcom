import { slugify } from "@/lib/text-utils";

const SLUG_MAX = 80;

/** A magazine article address from its title, with no timestamp. */
export function magazineArticleSlugBase(title: string): string {
  const base = slugify(title).replace(/-+$/, "").slice(0, 70);
  return base.length >= 3 ? base : "article";
}

/**
 * `base`, or `base-2`, `base-3`, … when `taken` already has that address.
 * The suffix is a short number, and only when this magazine already uses
 * the clean slug.
 */
export function nextMagazineArticleSlug(
  title: string,
  taken: ReadonlySet<string>,
): string {
  const base = magazineArticleSlugBase(title);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, SLUG_MAX - 5)}-${taken.size + 2}`;
}
