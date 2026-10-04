/** Query key that marks a start page opened by a recognised paste. */
export const RECOGNISED_PARAM = "recognised";

const START_PATH = "/dashboard/collectors/new";

/**
 * A preset's start page, optionally pre-filled. The one place that encodes a
 * prefill into the address (`readStartQuery` reads it back): one query
 * parameter per input field, plus `recognised=1`.
 */
export function startHref(
  presetId: string,
  opts: { prefill?: Record<string, string>; recognised?: boolean } = {},
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(opts.prefill ?? {})) {
    if (name !== RECOGNISED_PARAM) query.append(name, value);
  }
  if (opts.recognised) query.set(RECOGNISED_PARAM, "1");
  const qs = query.toString();
  return `${START_PATH}/${encodeURIComponent(presetId)}${qs ? `?${qs}` : ""}`;
}

export type StartQuery = {
  /** Values by input field name; the form keeps only its own fields. */
  prefill: Record<string, string>;
  recognised: boolean;
};

/** A start page's query (Next's `searchParams`) as prefill. */
export function readStartQuery(
  query: Record<string, string | string[] | undefined>,
): StartQuery {
  const entries: [string, string][] = [];
  for (const [name, value] of Object.entries(query)) {
    if (name === RECOGNISED_PARAM) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") entries.push([name, first]);
  }
  return {
    // fromEntries defines own properties: "__proto__" stays plain data.
    prefill: Object.fromEntries(entries),
    recognised: query[RECOGNISED_PARAM] === "1",
  };
}
