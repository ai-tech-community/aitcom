export function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Number(clamp((part / total) * 100, 0, 100).toFixed(2));
}

export function computeVisibility(input: {
  mentions: number;
  totalRuns: number;
}): number {
  return pct(input.mentions, input.totalRuns);
}

export function computeShareOfVoice(input: {
  brandMentions: number;
  totalMentions: number;
}): number {
  return pct(input.brandMentions, input.totalMentions);
}

export function computeAveragePosition(
  ranks: Array<number | null | undefined>,
): number | null {
  const valid = ranks.filter(
    (rank): rank is number => typeof rank === "number" && Number.isFinite(rank),
  );
  if (valid.length === 0) return null;
  return Number(
    (valid.reduce((total, rank) => total + rank, 0) / valid.length).toFixed(2),
  );
}

export function computeCitationRate(input: {
  citedRuns: number;
  totalRuns: number;
}): number {
  return pct(input.citedRuns, input.totalRuns);
}

export interface BrandMetricSummary {
  visibilityPct: number;
  shareOfVoicePct: number;
  avgPosition: number | null;
  sentimentScore: number;
  sourceVisibilityPct: number;
  citationRatePct: number;
  sampleSize: number;
}

export function computeBrandMetricSummary(input: {
  brandMentionRuns: number;
  brandMentions: number;
  totalMentions: number;
  eligibleRuns: number;
  ranks: Array<number | null | undefined>;
  sentimentScore: number;
  ownedSourceRuns: number;
  citedRuns: number;
}): BrandMetricSummary {
  const eligibleRuns = safeCount(input.eligibleRuns);

  return {
    visibilityPct: computeVisibility({
      mentions: safeCount(input.brandMentionRuns),
      totalRuns: eligibleRuns,
    }),
    shareOfVoicePct: computeShareOfVoice({
      brandMentions: safeCount(input.brandMentions),
      totalMentions: safeCount(input.totalMentions),
    }),
    avgPosition: computeAveragePosition(input.ranks),
    sentimentScore: Number(safeSentimentScore(input.sentimentScore).toFixed(2)),
    sourceVisibilityPct: pct(safeCount(input.ownedSourceRuns), eligibleRuns),
    citationRatePct: computeCitationRate({
      citedRuns: safeCount(input.citedRuns),
      totalRuns: eligibleRuns,
    }),
    sampleSize: eligibleRuns,
  };
}

export function deriveOwnedDomains(
  website: string | null | undefined,
): string[] {
  if (!website?.trim()) return [];

  try {
    const url = new URL(
      website.includes("://") ? website : `https://${website}`,
    );
    const domain = toRegistrableDomain(url.hostname);
    return domain ? [domain] : [];
  } catch {
    return [];
  }
}

function toRegistrableDomain(hostname: string): string | null {
  const host = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  if (!host || host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host || null;
  }

  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;

  const twoPartPublicSuffixes = new Set([
    "co.uk",
    "com.au",
    "com.br",
    "co.jp",
    "co.nz",
    "com.sg",
  ]);
  const suffix = parts.slice(-2).join(".");
  const labelCount = twoPartPublicSuffixes.has(suffix) ? 3 : 2;

  return parts.slice(-labelCount).join(".");
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function safeSentimentScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -100, 100);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
