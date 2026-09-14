export const AWESOME_STAR_STALE_DAYS = 7;

export const AWESOME_STAR_TOOLTIP = "Live from the repo · refreshed daily";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AwesomeStarHost = "github" | "gitlab";

export function formatAwesomeStarCount(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return compact(count, 1_000, "k");
  return compact(count, 1_000_000, "m");
}

export function visibleAwesomeStarLine(
  card: {
    starCount?: number | null;
    starsCheckedAt?: string | null;
    repoHost: AwesomeStarHost;
  },
  now: Date = new Date(),
): string | null {
  const count = card.starCount;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return null;
  }
  if (!card.starsCheckedAt) return null;
  const checked = new Date(card.starsCheckedAt);
  if (Number.isNaN(checked.getTime())) return null;
  if (now.getTime() - checked.getTime() > AWESOME_STAR_STALE_DAYS * DAY_MS) {
    return null;
  }
  return `★ ${formatAwesomeStarCount(count)} on ${hostLabel(card.repoHost)}`;
}

function hostLabel(host: AwesomeStarHost): "GitHub" | "GitLab" {
  return host === "gitlab" ? "GitLab" : "GitHub";
}

function compact(
  count: number,
  unit: 1_000 | 1_000_000,
  suffix: "k" | "m",
): string {
  const rounded = Math.round((count / unit) * 10) / 10;
  return `${rounded}${suffix}`;
}
