/** The shape Next hands a page as its awaited `searchParams`. */
export type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * A page's `searchParams` as `URLSearchParams`, unchanged: repeated params
 * keep their order and empty values stay, so a redirect can pass the query
 * on exactly as it arrived.
 */
export function searchParamsFromRecord(
  record: SearchParamsRecord,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    for (const each of Array.isArray(value) ? value : [value]) {
      if (each !== undefined) params.append(key, each);
    }
  }
  return params;
}
