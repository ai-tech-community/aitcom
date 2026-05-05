export function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Number(((part / total) * 100).toFixed(2));
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
    (rank): rank is number =>
      typeof rank === "number" && Number.isFinite(rank),
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
