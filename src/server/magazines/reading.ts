import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Where } from "payload";

import type { AppLocale } from "@/i18n/messages";
import {
  articleTextModeFor,
  type IssueReaderAccess,
} from "@/lib/magazines/access";
import type {
  ArticleItemView,
  EditorItemView,
} from "@/lib/magazines/item-views";
import type { MagazineRole } from "@/lib/magazines/roles";
import {
  ISSUE_LAYOUTS,
  type IssueLayout,
  type IssueStatus,
  type IssueVisibility,
} from "@/lib/magazines/values";
import { effectiveVisibility } from "@/lib/magazines/visibility";
import type { Article, Magazine, MagazineIssue } from "@/payload-types";
import {
  canReadContent,
  type CommunityVisibility,
} from "@/server/communities/content-visibility";
import { communities } from "@/server/db/schema";
import { memberDisplayName } from "@/server/members/display-name";

import type { Deps } from "./deps";
import { loadMagazineEditorship } from "./editorship";
import { issueAccessFacts, resolveMagazineIssueAccess } from "./issue-access";
import { itemContextFor } from "./items/context";
import {
  loadIssueItemViews,
  loadIssueItemViewsOfKinds,
  type StoredBlock,
} from "./items/registry";
import {
  getMagazineForCommunity,
  magazineTopicsOf,
  normalizeTopics,
} from "./magazine-service";
import {
  type IssueReadScope,
  issueReadScopeForCommunity,
  loadIssueReadScope,
  readableIssueWhere,
} from "./readable-issues";
import { relationIdOrNull } from "./relation-id";

/**
 * Read models for the magazine reading pages (ADR-0042): the `/magazines`
 * home, a magazine's shelf, an issue, a magazine article and the community
 * Magazine tab. Every rule comes from `resolveMagazineIssueAccess` (one
 * issue) or its query twin `readableIssueWhere` (many issues).
 *
 * `null` always means "answer 404". Nothing here caches across requests:
 * a visibility change shows on every surface on the next request.
 */

/** A community as the reading pages show it. */
export type ReadingCommunity = { name: string; slug: string };

/** A magazine's identity on its reading pages. */
export type MagazineSummary = {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  topics: string[];
};

/** One issue as a cover card on any listing. */
export type IssueCard = {
  id: number;
  number: number;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  /** The stored value. Surfaces use `effectiveVisibility` (preflight F10). */
  visibility: IssueVisibility;
  /**
   * What non-members actually get: an unconfirmed public issue in an
   * unlisted community is members-only. Badges, robots and JSON-LD key off
   * this value.
   */
  effectiveVisibility: IssueVisibility;
  magazine: { name: string; slug: string; logoUrl: string | null };
  community: ReadingCommunity;
};

/** One magazine on the `/magazines` home, with its newest public issue. */
export type MagazineCard = MagazineSummary & {
  community: ReadingCommunity;
  latest: IssueCard;
};

export type { IssueReaderAccess } from "@/lib/magazines/access";

/** Issues in "Just published" on the home, besides the featured one. */
const JUST_PUBLISHED_COUNT = 4;
/** Topic filter chips on the home. */
const HOME_TOPIC_COUNT = 8;
/** Past issues in an issue page's side rail. */
const PAST_ISSUE_COUNT = 3;

/** Listings show what is out; editors manage drafts on the editor desk. */
const PUBLISHED: Where = { status: { equals: "published" } };

// ── Loading helpers ──────────────────────────────────────────────────────

export type MagazineCommunityRow = CommunityVisibility & {
  id: string;
  name: string;
};

const COMMUNITY_COLUMNS = {
  id: true,
  name: true,
  slug: true,
  isListedInDirectory: true,
} as const;

/** Live (not soft-deleted) communities by id. */
async function liveCommunitiesById(
  database: Deps["db"],
  ids: readonly string[],
): Promise<Map<string, MagazineCommunityRow>> {
  if (ids.length === 0) return new Map();
  const rows = await database.query.communities.findMany({
    where: and(
      inArray(communities.id, [...ids]),
      isNull(communities.deletedAt),
    ),
    columns: COMMUNITY_COLUMNS,
  });
  return new Map(rows.map((row) => [row.id, row]));
}

async function liveCommunityBySlug(
  database: Deps["db"],
  slug: string,
): Promise<MagazineCommunityRow | null> {
  const row = await database.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: COMMUNITY_COLUMNS,
  });
  return row ?? null;
}

export async function findMagazineBySlug(
  payload: Deps["payload"],
  slug: string,
): Promise<Magazine | null> {
  const { docs } = await payload.find({
    collection: "magazines",
    where: { slug: { equals: slug } },
    depth: 0,
    limit: 1,
    pagination: false,
  });
  return docs[0] ?? null;
}

function toMagazineSummary(magazine: Magazine): MagazineSummary {
  return {
    id: magazine.id,
    name: magazine.name,
    slug: magazine.slug,
    logoUrl: magazine.logoUrl ?? null,
    description: magazine.description ?? null,
    topics: magazineTopicsOf(magazine),
  };
}

function toReadingCommunity(community: MagazineCommunityRow): ReadingCommunity {
  return { name: community.name, slug: community.slug };
}

function toIssueCard(
  issue: MagazineIssue,
  magazine: Magazine,
  community: MagazineCommunityRow,
): IssueCard {
  return {
    id: issue.id,
    number: Number(issue.number),
    title: issue.title,
    slug: issue.slug,
    coverImageUrl: issue.coverImageUrl ?? null,
    publishedAt: issue.publishedAt ?? null,
    visibility: issue.visibility,
    effectiveVisibility: effectiveVisibility(
      {
        visibility: issue.visibility,
        publicConfirmedAt: issue.publicConfirmedAt ?? null,
      },
      community,
    ),
    magazine: {
      name: magazine.name,
      slug: magazine.slug,
      logoUrl: magazine.logoUrl ?? null,
    },
    community: toReadingCommunity(community),
  };
}

/** Published issues of one magazine the scope may read, newest number first. */
async function readableMagazineIssues(
  deps: Deps,
  scope: IssueReadScope,
  magazineId: number,
  locale: AppLocale,
  opts: { excludeId?: number; limit?: number } = {},
): Promise<MagazineIssue[]> {
  const where: Where[] = [
    readableIssueWhere(scope),
    PUBLISHED,
    { magazine: { equals: magazineId } },
  ];
  if (opts.excludeId !== undefined) {
    where.push({ id: { not_equals: opts.excludeId } });
  }
  const { docs } = await deps.payload.find({
    collection: "magazine-issues",
    where: { and: where },
    sort: "-number",
    depth: 0,
    locale,
    ...(opts.limit === undefined
      ? { pagination: false }
      : { limit: opts.limit }),
  });
  return docs;
}

// ── /magazines home ──────────────────────────────────────────────────────

/** The most common topics across magazines, ties alphabetical. */
function commonTopics(magazines: Magazine[], count: number): string[] {
  const tally = new Map<string, number>();
  for (const magazine of magazines) {
    for (const topic of magazineTopicsOf(magazine)) {
      tally.set(topic, (tally.get(topic) ?? 0) + 1);
    }
  }
  return [...tally]
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .slice(0, count)
    .map(([topic]) => topic);
}

/**
 * The `/magazines` home: the newest public issue with a cover as featured,
 * the next newest as "Just published", and every magazine with a public
 * issue (newest first), optionally narrowed to one topic. Always the
 * anonymous scope, whoever asks: the home is the public face (Decision 10),
 * so a member never sees members-only issues here.
 */
export async function loadMagazinesHome(
  deps: Deps,
  opts: { locale: AppLocale; topic?: string },
): Promise<{
  featured: IssueCard | null;
  justPublished: IssueCard[];
  magazines: MagazineCard[];
  topics: string[];
}> {
  const scope = await loadIssueReadScope(deps.db, null);

  // Pass 1: every listed issue, light columns only, newest first.
  const { docs: listed } = await deps.payload.find({
    collection: "magazine-issues",
    where: { and: [readableIssueWhere(scope), PUBLISHED] },
    sort: ["-publishedAt", "-id"],
    select: { magazine: true, publishedAt: true, coverImageUrl: true },
    depth: 0,
    pagination: false,
  });

  const featuredId = listed.find((issue) => issue.coverImageUrl)?.id ?? null;
  const justPublishedIds = listed
    .filter((issue) => issue.id !== featuredId)
    .slice(0, JUST_PUBLISHED_COUNT)
    .map((issue) => issue.id);
  const latestByMagazine = new Map<number, number>();
  for (const issue of listed) {
    const magazineId = relationIdOrNull(issue.magazine);
    if (magazineId !== null && !latestByMagazine.has(magazineId)) {
      latestByMagazine.set(magazineId, issue.id);
    }
  }
  if (latestByMagazine.size === 0) {
    return { featured: null, justPublished: [], magazines: [], topics: [] };
  }

  const { docs: magazineDocs } = await deps.payload.find({
    collection: "magazines",
    where: { id: { in: [...latestByMagazine.keys()] } },
    depth: 0,
    pagination: false,
  });
  const magazinesById = new Map(magazineDocs.map((doc) => [doc.id, doc]));
  // In newest-issue order, as pass 1 found them.
  const listedMagazines = [...latestByMagazine.keys()]
    .map((id) => magazinesById.get(id))
    .filter((doc): doc is Magazine => doc !== undefined);
  const topic = opts.topic ? normalizeTopics([opts.topic])[0] : undefined;
  const shownMagazines = topic
    ? listedMagazines.filter((doc) => magazineTopicsOf(doc).includes(topic))
    : listedMagazines;

  // Pass 2: full documents for the issues the page shows.
  const shownIssueIds = new Set<number>([
    ...(featuredId === null ? [] : [featuredId]),
    ...justPublishedIds,
    ...shownMagazines.map((doc) => latestByMagazine.get(doc.id)!),
  ]);
  const [{ docs: issueDocs }, communitiesById] = await Promise.all([
    deps.payload.find({
      collection: "magazine-issues",
      where: { id: { in: [...shownIssueIds] } },
      depth: 0,
      locale: opts.locale,
      pagination: false,
    }),
    liveCommunitiesById(
      deps.db,
      listedMagazines.map((doc) => doc.communityId),
    ),
  ]);
  const issuesById = new Map(issueDocs.map((doc) => [doc.id, doc]));

  const cardOf = (issueId: number | null | undefined): IssueCard | null => {
    const issue = issueId == null ? undefined : issuesById.get(issueId);
    const magazine = issue
      ? magazinesById.get(relationIdOrNull(issue.magazine) ?? -1)
      : undefined;
    const community = magazine
      ? communitiesById.get(magazine.communityId)
      : undefined;
    return issue && magazine && community
      ? toIssueCard(issue, magazine, community)
      : null;
  };

  const magazines: MagazineCard[] = [];
  for (const doc of shownMagazines) {
    const latest = cardOf(latestByMagazine.get(doc.id));
    const community = communitiesById.get(doc.communityId);
    if (!latest || !community) continue;
    magazines.push({
      ...toMagazineSummary(doc),
      community: toReadingCommunity(community),
      latest,
    });
  }

  return {
    featured: cardOf(featuredId),
    justPublished: justPublishedIds
      .map(cardOf)
      .filter((card): card is IssueCard => card !== null),
    magazines,
    topics: commonTopics(listedMagazines, HOME_TOPIC_COUNT),
  };
}

/** One rule for both the shelf and the subscription API. */
export function mayKnowMagazine(input: {
  hasReadableIssue: boolean;
  community: MagazineCommunityRow;
  isMember: boolean;
}): boolean {
  return (
    input.hasReadableIssue || canReadContent(input.community, input.isMember)
  );
}

/** A small existence query, always limited to published readable issues. */
export async function readableIssueExists(
  deps: Deps,
  scope: IssueReadScope,
  magazineId: number,
): Promise<boolean> {
  const { docs } = await deps.payload.find({
    collection: "magazine-issues",
    where: {
      and: [
        readableIssueWhere(scope),
        PUBLISHED,
        { magazine: { equals: magazineId } },
      ],
    },
    limit: 1,
    depth: 0,
    select: { communityId: true },
  });
  return docs.length > 0;
}

export async function findMagazineForViewer(
  deps: Deps,
  opts: {
    magazineSlug: string;
    viewerId: string | null;
  },
): Promise<{ magazine: Magazine; community: MagazineCommunityRow } | null> {
  const magazine = await findMagazineBySlug(deps.payload, opts.magazineSlug);
  if (!magazine) return null;
  const community = (
    await liveCommunitiesById(deps.db, [magazine.communityId])
  ).get(magazine.communityId);
  if (!community) return null;
  const scope = await loadIssueReadScope(deps.db, opts.viewerId);
  return mayKnowMagazine({
    hasReadableIssue: await readableIssueExists(deps, scope, magazine.id),
    community,
    isMember: scope.memberCommunityIds.includes(community.id),
  })
    ? { magazine, community }
    : null;
}

/** What the `/magazines` home renders. */
export type MagazinesHomeData = Awaited<ReturnType<typeof loadMagazinesHome>>;

// ── Shelf and community tab ──────────────────────────────────────────────

type Shelf = { issues: IssueCard[]; viewerIsEditor: boolean };

/**
 * The published issues of a magazine the viewer may read, or null (404)
 * when the viewer may read none and the community's content is closed to
 * them: a private community's magazine stays unknown to outsiders until it
 * has a public issue.
 */
async function loadShelf(
  deps: Deps,
  magazine: Magazine,
  community: MagazineCommunityRow,
  scope: IssueReadScope,
  locale: AppLocale,
): Promise<Shelf | null> {
  const issues = await readableMagazineIssues(deps, scope, magazine.id, locale);
  const isMember = scope.memberCommunityIds.includes(community.id);
  if (
    !mayKnowMagazine({
      hasReadableIssue: issues.length > 0,
      community,
      isMember,
    })
  )
    return null;
  return {
    issues: issues.map((issue) => toIssueCard(issue, magazine, community)),
    viewerIsEditor: scope.editorCommunityIds.includes(community.id),
  };
}

/** `/magazines/[magazine]`: the magazine and the issues the viewer may read. */
export async function loadMagazineShelf(
  deps: Deps,
  opts: { magazineSlug: string; viewerId: string | null; locale: AppLocale },
): Promise<null | {
  magazine: MagazineSummary;
  community: ReadingCommunity;
  issues: IssueCard[];
  viewerIsEditor: boolean;
}> {
  const magazine = await findMagazineBySlug(deps.payload, opts.magazineSlug);
  if (!magazine) return null;
  const community = (
    await liveCommunitiesById(deps.db, [magazine.communityId])
  ).get(magazine.communityId);
  if (!community) return null;
  const shelf = await loadShelf(
    deps,
    magazine,
    community,
    await loadIssueReadScope(deps.db, opts.viewerId),
    opts.locale,
  );
  if (!shelf) return null;
  return {
    magazine: toMagazineSummary(magazine),
    community: toReadingCommunity(community),
    ...shelf,
  };
}

/** What a magazine's shelf page renders. */
export type MagazineShelfData = NonNullable<
  Awaited<ReturnType<typeof loadMagazineShelf>>
>;

/**
 * The community's Magazine tab. `null` only for 404 (no such live
 * community, or a magazine the viewer may not know about). A community
 * without a magazine answers `magazine: null` with `viewerIsEditor`, so
 * editors can be offered to start one (preflight F8).
 */
export async function loadCommunityMagazineTab(
  deps: Deps,
  opts: { communitySlug: string; viewerId: string | null; locale: AppLocale },
): Promise<null | {
  magazine: MagazineSummary | null;
  latest: IssueCard | null;
  issues: IssueCard[];
  viewerIsEditor: boolean;
  viewerRole: MagazineRole | null;
}> {
  const community = await liveCommunityBySlug(deps.db, opts.communitySlug);
  if (!community) return null;
  const magazine = await getMagazineForCommunity(deps.payload, community.id);
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: community.id, magazineId: magazine?.id ?? null },
    opts.viewerId,
  );
  if (!magazine) {
    return {
      magazine: null,
      latest: null,
      issues: [],
      viewerIsEditor: standing.isEditor,
      viewerRole: standing.role,
    };
  }
  const shelf = await loadShelf(
    deps,
    magazine,
    community,
    issueReadScopeForCommunity(standing, community),
    opts.locale,
  );
  if (!shelf) return null;
  return {
    magazine: toMagazineSummary(magazine),
    latest: shelf.issues[0] ?? null,
    ...shelf,
    viewerRole: standing.role,
  };
}

/** What the community's Magazine tab renders. */
export type CommunityMagazineTabData = NonNullable<
  Awaited<ReturnType<typeof loadCommunityMagazineTab>>
>;

// ── Issue and article pages ──────────────────────────────────────────────

type ReadableIssue = {
  access: IssueReaderAccess;
  magazine: Magazine;
  community: MagazineCommunityRow;
  issue: MagazineIssue;
};

/**
 * One issue of a magazine with the viewer's access, or null when the
 * magazine, the issue or its live community is missing, or the viewer's
 * access is `none`.
 */
async function loadReadableIssue(
  deps: Deps,
  opts: {
    magazineSlug: string;
    issueSlug: string;
    viewerId: string | null;
    locale: AppLocale;
  },
): Promise<ReadableIssue | null> {
  const magazine = await findMagazineBySlug(deps.payload, opts.magazineSlug);
  if (!magazine) return null;
  const [{ docs }, communitiesById, viewer] = await Promise.all([
    deps.payload.find({
      collection: "magazine-issues",
      where: {
        and: [
          { magazine: { equals: magazine.id } },
          { slug: { equals: opts.issueSlug } },
        ],
      },
      depth: 0,
      limit: 1,
      pagination: false,
      locale: opts.locale,
    }),
    liveCommunitiesById(deps.db, [magazine.communityId]),
    loadMagazineEditorship(
      deps.db,
      { communityId: magazine.communityId, magazineId: magazine.id },
      opts.viewerId,
    ),
  ]);
  const issue = docs[0];
  const community = communitiesById.get(magazine.communityId);
  if (!issue || !community) return null;
  const facts = issueAccessFacts(issue);
  if (!facts) return null;

  const access = resolveMagazineIssueAccess({
    viewer,
    community: { ...community, deleted: false },
    issue: facts,
  });
  if (access === "none") return null;
  return { access, magazine, community, issue };
}

function issueLayoutOf(issue: MagazineIssue): IssueLayout {
  const layout = issue.layout;
  return layout && (ISSUE_LAYOUTS as readonly string[]).includes(layout)
    ? layout
    : ISSUE_LAYOUTS[0];
}

function isArticleView(view: EditorItemView): view is ArticleItemView {
  return view.kind === "article" && !("unavailable" in view);
}

function itemViewsOf(
  deps: Deps,
  found: ReadableIssue,
  locale: AppLocale,
  viewerId: string | null,
): Promise<EditorItemView[]> {
  return loadIssueItemViews(
    (found.issue.items ?? []) as StoredBlock[],
    itemContextFor(deps, {
      magazineId: found.magazine.id,
      community: found.community,
      issueId: found.issue.id,
      locale,
      access: found.access,
      viewerId,
    }),
  );
}

/**
 * `/magazines/[magazine]/[issue]`: the issue with its items as the viewer
 * may see them (editors also get drafts and unavailable markers), the
 * three newest other published issues the viewer may read, and a reading
 * time summed over the articles shown.
 */
export async function loadIssuePage(
  deps: Deps,
  opts: {
    magazineSlug: string;
    issueSlug: string;
    viewerId: string | null;
    locale: AppLocale;
  },
): Promise<null | {
  access: IssueReaderAccess;
  magazine: MagazineSummary;
  community: ReadingCommunity;
  issue: IssueCard & {
    /** Readers only ever get `published`; editors also open drafts. */
    status: IssueStatus;
    editorNote: unknown;
    /** Who signs the editor's note: the editor who published the issue. */
    signedBy: string | null;
    layout: IssueLayout;
  };
  items: EditorItemView[];
  pastIssues: IssueCard[];
  readingMinutes: number;
}> {
  const found = await loadReadableIssue(deps, opts);
  if (!found) return null;
  const { access, magazine, community, issue } = found;

  const [items, pastIssues, signedBy] = await Promise.all([
    itemViewsOf(deps, found, opts.locale, opts.viewerId),
    loadIssueReadScope(deps.db, opts.viewerId).then((scope) =>
      readableMagazineIssues(deps, scope, magazine.id, opts.locale, {
        excludeId: issue.id,
        limit: PAST_ISSUE_COUNT,
      }),
    ),
    issue.publishedBy ? memberDisplayName(deps.db, issue.publishedBy) : null,
  ]);
  const articleMinutes = items
    .filter(isArticleView)
    .reduce((sum, view) => sum + view.article.readingMinutes, 0);

  return {
    access,
    magazine: toMagazineSummary(magazine),
    community: toReadingCommunity(community),
    issue: {
      ...toIssueCard(issue, magazine, community),
      status: issue.status,
      editorNote: issue.editorNote ?? null,
      signedBy,
      layout: issueLayoutOf(issue),
    },
    items,
    pastIssues: pastIssues.map((past) =>
      toIssueCard(past, magazine, community),
    ),
    readingMinutes: Math.max(1, articleMinutes),
  };
}

/** What the issue reading page renders. */
export type IssuePageData = NonNullable<
  Awaited<ReturnType<typeof loadIssuePage>>
>;

/**
 * `/magazines/[magazine]/[issue]/[article]`: a magazine article read
 * through the issue that holds it. Null unless the article is placed in
 * THIS issue and the viewer may read the issue: an article is never
 * readable on its own, so a published article in a draft or members-only
 * issue stays hidden from readers. Readers read the published document;
 * editors read the latest draft.
 */
export async function loadMagazineArticlePage(
  deps: Deps,
  opts: {
    magazineSlug: string;
    issueSlug: string;
    articleSlug: string;
    viewerId: string | null;
    locale: AppLocale;
  },
): Promise<null | {
  access: IssueReaderAccess;
  magazine: MagazineSummary;
  issue: IssueCard & {
    /** Readers only ever get `published`; editors also open drafts. */
    status: IssueStatus;
  };
  article: Article;
  nextInIssue: ArticleItemView | null;
}> {
  const found = await loadReadableIssue(deps, opts);
  if (!found) return null;
  const { access, magazine, community, issue } = found;
  const textMode = articleTextModeFor(access);

  const { docs } = await deps.payload.find({
    collection: "articles",
    where: {
      and: [
        { slug: { equals: opts.articleSlug } },
        { magazine: { equals: magazine.id } },
        { magazineIssue: { equals: issue.id } },
      ],
    },
    draft: textMode === "latest_draft",
    depth: 0,
    limit: 1,
    pagination: false,
    locale: opts.locale,
  });
  const article = docs[0];
  if (!article) return null;
  if (textMode === "published" && article.status !== "published") return null;

  const articles = (
    await loadIssueItemViewsOfKinds(
      (issue.items ?? []) as StoredBlock[],
      itemContextFor(deps, {
        magazineId: magazine.id,
        community,
        issueId: issue.id,
        locale: opts.locale,
        access,
        viewerId: opts.viewerId,
      }),
      ["article"],
    )
  ).filter(isArticleView);
  const position = articles.findIndex((view) => view.article.id === article.id);

  return {
    access,
    magazine: toMagazineSummary(magazine),
    issue: { ...toIssueCard(issue, magazine, community), status: issue.status },
    article,
    nextInIssue: position === -1 ? null : (articles[position + 1] ?? null),
  };
}

/** What the magazine article page renders. */
export type MagazineArticlePageData = NonNullable<
  Awaited<ReturnType<typeof loadMagazineArticlePage>>
>;
