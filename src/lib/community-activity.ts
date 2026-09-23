/**
 * The community activity feed: one time-ordered stream across posts, forum
 * threads, ideas, events, and member joins. Pure types and ordering only;
 * reading each source lives in `src/server/communities/activity-feed.ts`.
 */

export type ActivityKind = "post" | "thread" | "idea" | "event" | "join";

/** One source row before merging. `id` is unique within its kind. */
export type ActivityEntry<
  K extends ActivityKind = ActivityKind,
  T = unknown,
> = {
  kind: K;
  id: string;
  /** ISO timestamp the row is ordered by (created / joined). */
  at: string;
  data: T;
};

/** Position after the last item shown. Exclusive: that item is not repeated. */
export type ActivityCursor = { at: string; key: string };

export function activityKey(entry: Pick<ActivityEntry, "kind" | "id">): string {
  return `${entry.kind}:${entry.id}`;
}

/**
 * Newest first; ties on the same instant break by key, so the order is
 * total and a cursor never skips or repeats a row.
 */
export function compareActivity(
  a: { at: string; key: string },
  b: { at: string; key: string },
): number {
  const byTime = Date.parse(b.at) - Date.parse(a.at);
  if (byTime !== 0) return byTime;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

/** True when `entry` sorts strictly after the cursor (it belongs to a later page). */
export function isAfterCursor(
  entry: { at: string; key: string },
  cursor: ActivityCursor | null | undefined,
): boolean {
  if (!cursor) return true;
  return compareActivity(cursor, entry) < 0;
}

/**
 * Merge per-source rows into one page. Each source must already be limited
 * to rows at or before the cursor instant; this drops rows the cursor has
 * passed, orders everything, and cuts the page.
 */
export function mergeActivityPage(
  sources: ReadonlyArray<ReadonlyArray<ActivityEntry>>,
  cursor: ActivityCursor | null | undefined,
  limit: number,
): { entries: ActivityEntry[]; nextCursor: ActivityCursor | null } {
  const merged = sources
    .flat()
    .map((entry) => ({ entry, key: activityKey(entry) }))
    .filter(({ entry, key }) => isAfterCursor({ at: entry.at, key }, cursor))
    .sort((a, b) =>
      compareActivity(
        { at: a.entry.at, key: a.key },
        { at: b.entry.at, key: b.key },
      ),
    );
  const page = merged.slice(0, limit);
  const last = page.at(-1);
  return {
    entries: page.map(({ entry }) => entry),
    nextCursor:
      merged.length > limit && last
        ? { at: last.entry.at, key: last.key }
        : null,
  };
}

/** A feed item: every kind as-is, except neighbouring joins fold into one. */
export type ActivityGroup<J> =
  | { kind: "single"; entry: ActivityEntry }
  | { kind: "joins"; at: string; key: string; members: J[] };

/**
 * Fold runs of adjacent join entries into one group ("3 people joined"),
 * so a burst of joins reads as one moment instead of a wall of rows.
 */
export function groupAdjacentJoins<J>(
  entries: ReadonlyArray<ActivityEntry>,
): ActivityGroup<J>[] {
  const groups: ActivityGroup<J>[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (entry.kind === "join") {
      if (last?.kind === "joins") {
        last.members.push(entry.data as J);
        continue;
      }
      groups.push({
        kind: "joins",
        at: entry.at,
        key: activityKey(entry),
        members: [entry.data as J],
      });
      continue;
    }
    groups.push({ kind: "single", entry });
  }
  return groups;
}
