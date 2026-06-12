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
  if (value === null) return Number.NEGATIVE_INFINITY; // unsubmitted = oldest
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
