/** Search text for the news browse tools. `q` is the browse-news alias. */
export function newsBrowseQuery(input: {
  query?: string | null;
  q?: string | null;
}): string {
  const query = input.query?.trim() ?? "";
  const alias = input.q?.trim() ?? "";
  return (query || alias).slice(0, 200);
}

/** Case-insensitive substring match. An empty query keeps every row. */
export function matchesNewsBrowseQuery(
  fields: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}
