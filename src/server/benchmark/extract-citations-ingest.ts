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

export type SourceType =
  | "owned-site"
  | "user-generated"
  | "reference"
  | "third-party"
  | "unknown";

const USER_GENERATED_DOMAINS = new Set([
  "reddit.com",
  "quora.com",
  "stackoverflow.com",
  "x.com",
  "twitter.com",
]);

const REFERENCE_DOMAINS = new Set(["wikipedia.org", "wikidata.org"]);

const THIRD_PARTY_DOMAINS = new Set([
  "g2.com",
  "capterra.com",
  "zapier.com",
  "alternativeto.net",
]);

export function classifySourceDomain(
  domain: string,
  ownedDomains: string[],
): SourceType {
  const normalizedDomain = normalizeDomain(domain);
  if (!normalizedDomain) return "unknown";

  const normalizedOwnedDomains = ownedDomains
    .map(normalizeDomain)
    .filter((d): d is string => d !== null);
  if (
    normalizedOwnedDomains.some(
      (ownedDomain) =>
        normalizedDomain === ownedDomain ||
        normalizedDomain.endsWith(`.${ownedDomain}`),
    )
  ) {
    return "owned-site";
  }

  const registrableDomain = toRegistrableDomain(normalizedDomain);
  if (USER_GENERATED_DOMAINS.has(registrableDomain)) return "user-generated";
  if (REFERENCE_DOMAINS.has(registrableDomain)) return "reference";
  if (THIRD_PARTY_DOMAINS.has(registrableDomain)) return "third-party";
  return "unknown";
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

function normalizeDomain(domain: string): string | null {
  const host = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  return host || null;
}

function toRegistrableDomain(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 2) return domain;
  return parts.slice(-2).join(".");
}
