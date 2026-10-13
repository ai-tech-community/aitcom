/** Sections of the weekly digest. Absent rows mean the section is on. */
export const DIGEST_SECTIONS = [
  "news",
  "community",
  "events",
  "jobs",
  "startups",
] as const;

export type DigestSection = (typeof DIGEST_SECTIONS)[number];

export const OPTOUT_CATEGORIES = [
  "digest",
  "broadcast",
  "digest:news",
  "digest:community",
  "digest:events",
  "digest:jobs",
  "digest:startups",
] as const;

export type OptoutCategory = (typeof OPTOUT_CATEGORIES)[number];

export type OptoutRow = {
  communityId: string | null; // null = global
  category: OptoutCategory;
};

export type ResolvedPrefs = {
  globalDigestOptOut: boolean;
  digestOptOutCommunityIds: Set<string>;
  broadcastOptOutCommunityIds: Set<string>;
  /** Section ids the member turned off. Empty means every section is on. */
  digestOptOutSections: Set<DigestSection>;
};

const SECTION_CATEGORY = /^digest:(news|community|events|jobs|startups)$/;

export function digestSectionFromCategory(
  category: string,
): DigestSection | null {
  const match = SECTION_CATEGORY.exec(category);
  if (!match) return null;
  return match[1] as DigestSection;
}

export function digestSectionCategory(section: DigestSection): OptoutCategory {
  return `digest:${section}`;
}

/** Why this opt-out shape is rejected, or null when it is allowed. */
export function optoutInputError(input: {
  communityId: string | null;
  category: OptoutCategory;
}): string | null {
  if (input.communityId === null && input.category === "broadcast") {
    return 'Global broadcast opt-out does not exist. Use communityId with category "broadcast", or communityId null with category "digest".';
  }
  if (input.communityId !== null && digestSectionFromCategory(input.category)) {
    return "Digest section preferences are global. Leave communityId empty.";
  }
  return null;
}

/** Fold sparse opt-OUT rows into resolved preferences. Absence of a row means
 *  opted in (digests default opt-in, ADR-0014). A global `digest` row is the
 *  master off switch. Section rows are recorded separately and stay put when
 *  the master is off, so a later opt-in keeps the member's section choices. */
export function resolvePrefs(rows: OptoutRow[]): ResolvedPrefs {
  const resolved: ResolvedPrefs = {
    globalDigestOptOut: false,
    digestOptOutCommunityIds: new Set(),
    broadcastOptOutCommunityIds: new Set(),
    digestOptOutSections: new Set(),
  };
  for (const row of rows) {
    const section = digestSectionFromCategory(row.category);
    if (section) {
      if (row.communityId === null) resolved.digestOptOutSections.add(section);
      continue;
    }
    if (row.category === "digest" && row.communityId === null) {
      resolved.globalDigestOptOut = true;
    } else if (row.category === "digest" && row.communityId) {
      resolved.digestOptOutCommunityIds.add(row.communityId);
    } else if (row.category === "broadcast" && row.communityId) {
      resolved.broadcastOptOutCommunityIds.add(row.communityId);
    }
  }
  return resolved;
}
