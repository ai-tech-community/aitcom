export interface RawCitation {
  url: string;
  domain: string;
  title?: string | null;
  snippet?: string | null;
  position: number;
}

export interface NormalizedCitation {
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  position: number;
}

export function normalizeCitations(
  input: RawCitation[] | undefined,
): NormalizedCitation[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: NormalizedCitation[] = [];
  for (const c of input) {
    if (!c || typeof c.url !== "string" || c.url.length === 0) continue;
    if (typeof c.domain !== "string" || c.domain.length === 0) continue;
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    const position =
      typeof c.position === "number" && Number.isFinite(c.position)
        ? Math.trunc(c.position)
        : out.length + 1;
    out.push({
      url: c.url,
      domain: c.domain.replace(/^www\./i, "").toLowerCase(),
      title: c.title ?? null,
      snippet: c.snippet ? c.snippet.slice(0, 280) : null,
      position,
    });
  }
  return out;
}
