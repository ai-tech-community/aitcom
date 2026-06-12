// Pure visibility + sort rules for the public project gallery (#167): which
// teams appear (only ones that actually submitted) and in what order (newest
// submission, team name A–Z, or final rank once the hackathon is finalized).
// Db-free and tolerant of both Date and ISO-string timestamps so the same
// logic serves the server page and the client-side sort control after RSC
// serialization.

export type GallerySortKey = "newest" | "name" | "rank";

export interface GalleryListable {
  name: string;
  submittedAt: Date | string | null;
  finalRank: number | null;
}

/** Visibility rule: a team is in the gallery iff it submitted. */
export function submittedProjects<
  T extends Pick<GalleryListable, "submittedAt">,
>(rows: T[]): (T & { submittedAt: NonNullable<T["submittedAt"]> })[] {
  return rows.filter(
    (t): t is T & { submittedAt: NonNullable<T["submittedAt"]> } =>
      t.submittedAt !== null,
  );
}

function submittedMillis(value: Date | string | null): number {
  // Unsubmitted = oldest. MIN_SAFE_INTEGER (not -Infinity) so two nulls
  // subtract to 0 rather than NaN, keeping the comparator well-defined.
  if (value === null) return Number.MIN_SAFE_INTEGER;
  return new Date(value).getTime();
}

function byName(a: GalleryListable, b: GalleryListable): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Deterministic, non-mutating sort. Every comparator falls back to team name
 * so the order is total (stable across reloads) even on ties.
 */
export function sortGallery<T extends GalleryListable>(
  rows: T[],
  key: GallerySortKey,
): T[] {
  const compare = (a: T, b: T): number => {
    switch (key) {
      case "newest": {
        const diff =
          submittedMillis(b.submittedAt) - submittedMillis(a.submittedAt);
        return diff !== 0 ? diff : byName(a, b);
      }
      case "rank": {
        if (a.finalRank !== null && b.finalRank !== null) {
          return a.finalRank - b.finalRank || byName(a, b);
        }
        if (a.finalRank !== null) return -1;
        if (b.finalRank !== null) return 1;
        return byName(a, b);
      }
      case "name":
        return byName(a, b);
    }
  };
  return [...rows].sort(compare);
}

/** Rank sort only exists once finalize has stamped final ranks. */
export function gallerySortKeys(finalized: boolean): GallerySortKey[] {
  return finalized ? ["newest", "name", "rank"] : ["newest", "name"];
}

/**
 * Scheme allowlist for the captain-controlled artifact link: only http(s)
 * URLs may render as a public href (javascript:/data:/etc. are dropped).
 */
export function safeArtifactHref(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:"
    ? url
    : null;
}
