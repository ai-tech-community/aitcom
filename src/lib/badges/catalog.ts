/**
 * The badge catalog (ADR-0039): every badge a member can hold, as typed
 * data. Earning lives in `src/server/badges/`; this module only describes
 * badges, so it is safe to import from client components.
 *
 * Kinds:
 * - track: one kind of contribution in three tiers. A tier is reached when
 *   the track's metric meets its threshold; tier II implies tier I.
 * - milestone: a one-off step without tiers.
 * - limitedEdition: could only be earned at one moment (e.g. the first 100
 *   members).
 *
 * Slugs are the stored identifiers (`member_badge.badge_slug`). A slug is
 * never renamed: older tiers keep the slugs they were first stored under.
 * Thresholds can be tuned here without a migration; an earned badge is
 * never revoked.
 *
 * Names and descriptions live in the `badges` message namespace:
 * `names.<slug>`, `trackDescriptions.<track>` (with `{count}` = threshold),
 * `descriptions.<slug>` and `tracks.<track>`.
 */

/** Identifiers of the emblem glyphs the badge UI draws. */
export type BadgeGlyph =
  | "ticket"
  | "megaphone"
  | "flag"
  | "quill"
  | "rocket"
  | "mortarboard"
  | "lectern"
  | "handshake"
  | "robot"
  | "gauge"
  | "flame"
  | "id-card"
  | "compass"
  | "book"
  | "sparkle";

export const BADGE_TIERS = [1, 2, 3] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

interface TierSpec {
  readonly slug: string;
  readonly threshold: number;
}

interface TrackSpec {
  readonly glyph: BadgeGlyph;
  readonly tiers: readonly [TierSpec, TierSpec, TierSpec];
}

/**
 * Tracks with their tiers, lowest first. The metric each one counts is
 * declared next to the engine (`src/server/badges/metrics.ts`).
 */
export const BADGE_TRACKS = {
  /** Events attended. */
  regular: {
    glyph: "ticket",
    tiers: [
      { slug: "first_event", threshold: 1 },
      { slug: "regular", threshold: 3 },
      { slug: "veteran", threshold: 10 },
    ],
  },
  /** Native events organised that took place. */
  host: {
    glyph: "megaphone",
    tiers: [
      { slug: "host_1", threshold: 1 },
      { slug: "host_2", threshold: 5 },
      { slug: "host_3", threshold: 15 },
    ],
  },
  /** Challenges completed. */
  challenger: {
    glyph: "flag",
    tiers: [
      { slug: "first_challenge", threshold: 1 },
      { slug: "challenger_2", threshold: 5 },
      { slug: "challenger_3", threshold: 15 },
    ],
  },
  /** Articles published and approved. */
  writer: {
    glyph: "quill",
    tiers: [
      { slug: "article_author", threshold: 1 },
      { slug: "prolific_writer", threshold: 5 },
      { slug: "writer_3", threshold: 15 },
    ],
  },
  /** Launchpad projects published. */
  builder: {
    glyph: "rocket",
    tiers: [
      { slug: "first_launch", threshold: 1 },
      { slug: "builder_2", threshold: 3 },
      { slug: "builder_3", threshold: 10 },
    ],
  },
  /** Courses completed. */
  learner: {
    glyph: "mortarboard",
    tiers: [
      { slug: "course_complete", threshold: 1 },
      { slug: "learner_2", threshold: 3 },
      { slug: "learner_3", threshold: 10 },
    ],
  },
  /** Enrolments by other members in courses the member authored. */
  teacher: {
    glyph: "lectern",
    tiers: [
      { slug: "teacher_1", threshold: 10 },
      { slug: "teacher_2", threshold: 50 },
      { slug: "teacher_3", threshold: 250 },
    ],
  },
  /** Referrals that became active. */
  connector: {
    glyph: "handshake",
    tiers: [
      { slug: "connector_1", threshold: 1 },
      { slug: "connector_2", threshold: 5 },
      { slug: "connector_3", threshold: 20 },
    ],
  },
  /** Contributions of the member's agent. */
  agent_wrangler: {
    glyph: "robot",
    tiers: [
      { slug: "agent_master", threshold: 10 },
      { slug: "agent_wrangler_2", threshold: 50 },
      { slug: "agent_wrangler_3", threshold: 250 },
    ],
  },
  /** Benchmark cells the member helped cover. */
  benchmarker: {
    glyph: "gauge",
    tiers: [
      { slug: "benchmark-coverage-first", threshold: 1 },
      { slug: "benchmark-coverage-10", threshold: 10 },
      { slug: "benchmark-coverage-50", threshold: 50 },
    ],
  },
  /** Longest run of consecutive active days. */
  streak: {
    glyph: "flame",
    tiers: [
      { slug: "streak_1", threshold: 7 },
      { slug: "streak_2", threshold: 30 },
      { slug: "streak_3", threshold: 100 },
    ],
  },
} as const satisfies Record<string, TrackSpec>;

export type BadgeTrackId = keyof typeof BADGE_TRACKS;

export const BADGE_TRACK_IDS = Object.keys(BADGE_TRACKS) as BadgeTrackId[];

export const MILESTONES = {
  profile_complete: { glyph: "id-card" },
  onboarding_complete: { glyph: "compass" },
  tutorial_creator: { glyph: "book" },
} as const satisfies Record<string, { glyph: BadgeGlyph }>;

export type MilestoneSlug = keyof typeof MILESTONES;

export const LIMITED_EDITIONS = {
  /** The first 100 members. */
  early_adopter: { glyph: "sparkle", editionSize: 100 },
} as const satisfies Record<string, { glyph: BadgeGlyph; editionSize: number }>;

export type LimitedEditionSlug = keyof typeof LIMITED_EDITIONS;

export type TrackBadgeSlug =
  (typeof BADGE_TRACKS)[BadgeTrackId]["tiers"][number]["slug"];

export type BadgeSlug = TrackBadgeSlug | MilestoneSlug | LimitedEditionSlug;

interface BadgeBase {
  slug: BadgeSlug;
  glyph: BadgeGlyph;
  /** Key in the `badges` namespace. */
  nameKey: `names.${BadgeSlug}`;
  /** Key in the `badges` namespace; format it with `descriptionValues`. */
  descriptionKey:
    | `trackDescriptions.${BadgeTrackId}`
    | `descriptions.${MilestoneSlug | LimitedEditionSlug}`;
  descriptionValues: { count: number } | undefined;
}

export interface TrackBadge extends BadgeBase {
  kind: "track";
  slug: TrackBadgeSlug;
  track: BadgeTrackId;
  tier: BadgeTier;
  threshold: number;
}

export interface MilestoneBadge extends BadgeBase {
  kind: "milestone";
  slug: MilestoneSlug;
}

export interface LimitedEditionBadge extends BadgeBase {
  kind: "limitedEdition";
  slug: LimitedEditionSlug;
  editionSize: number;
}

export type CatalogBadge = TrackBadge | MilestoneBadge | LimitedEditionBadge;

export type BadgeKind = CatalogBadge["kind"];

function trackBadges(track: BadgeTrackId): TrackBadge[] {
  return BADGE_TRACKS[track].tiers.map((tier, index) => ({
    kind: "track",
    slug: tier.slug,
    track,
    tier: BADGE_TIERS[index]!,
    threshold: tier.threshold,
    glyph: BADGE_TRACKS[track].glyph,
    nameKey: `names.${tier.slug}`,
    descriptionKey: `trackDescriptions.${track}`,
    descriptionValues: { count: tier.threshold },
  }));
}

/** Every badge, tracks first (tiers ascending), then milestones and editions. */
export const BADGE_CATALOG: readonly CatalogBadge[] = [
  ...BADGE_TRACK_IDS.flatMap(trackBadges),
  ...(Object.keys(MILESTONES) as MilestoneSlug[]).map(
    (slug): MilestoneBadge => ({
      kind: "milestone",
      slug,
      glyph: MILESTONES[slug].glyph,
      nameKey: `names.${slug}`,
      descriptionKey: `descriptions.${slug}`,
      descriptionValues: undefined,
    }),
  ),
  ...(Object.keys(LIMITED_EDITIONS) as LimitedEditionSlug[]).map(
    (slug): LimitedEditionBadge => ({
      kind: "limitedEdition",
      slug,
      glyph: LIMITED_EDITIONS[slug].glyph,
      editionSize: LIMITED_EDITIONS[slug].editionSize,
      nameKey: `names.${slug}`,
      descriptionKey: `descriptions.${slug}`,
      descriptionValues: { count: LIMITED_EDITIONS[slug].editionSize },
    }),
  ),
];

const BY_SLUG: ReadonlyMap<string, CatalogBadge> = new Map(
  BADGE_CATALOG.map((badge) => [badge.slug, badge]),
);

/** Every catalog slug, in catalog order. */
export const BADGE_SLUGS: readonly BadgeSlug[] = BADGE_CATALOG.map(
  (badge) => badge.slug,
);

export function isBadgeSlug(slug: string): slug is BadgeSlug {
  return BY_SLUG.has(slug);
}

/** The catalog entry for a stored slug, or null when it is not in the catalog. */
export function catalogBadge(slug: string): CatalogBadge | null {
  return BY_SLUG.get(slug) ?? null;
}

/** A track's tiers, lowest first. */
export function badgesOfTrack(track: BadgeTrackId): readonly TrackBadge[] {
  return BADGE_CATALOG.filter(
    (badge): badge is TrackBadge =>
      badge.kind === "track" && badge.track === track,
  );
}

/** The tiers of a track a metric value reaches, lowest first. */
export function reachedTiers(
  track: BadgeTrackId,
  metric: number,
): readonly TrackBadge[] {
  return badgesOfTrack(track).filter((badge) => metric >= badge.threshold);
}
