/**
 * Build a blog URL with optional search, tag, and page params.
 * Returns locale-less paths (e.g., `/blog?tag=ai`).
 * Must be used with `<Link>` from `@/i18n/navigation` which prepends the locale.
 */
export function buildBlogUrl(params: {
  q?: string;
  tag?: string;
  page?: number;
}): string {
  const searchParams = new URLSearchParams();

  const q = params.q?.trim();
  if (q) searchParams.set("q", q);
  if (params.tag) searchParams.set("tag", params.tag);
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));

  const qs = searchParams.toString();
  return qs ? `/blog?${qs}` : "/blog";
}
