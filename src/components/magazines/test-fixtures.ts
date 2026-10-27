/**
 * Test data for the magazine reading components: item views and issue pages
 * shaped exactly like the read models (`src/server/magazines/reading.ts`).
 */
import type {
  ArticleItemView,
  LaunchpadProjectItemView,
  EventItemView,
  ForumThreadItemView,
  EditorialItemView,
  NewsItemView,
  StorylineItemView,
  UnavailableItem,
} from "@/lib/magazines/item-views";
import type { Article } from "@/payload-types";
import {
  DEFAULT_AUTO_DRAFT_SETTINGS,
  resolveSources,
} from "@/lib/magazines/auto-draft";
import type { IssueHistoryEntry } from "@/lib/magazines/issue-history";
import type { RouterOutputs } from "@/trpc/react";
import type { DraftMagazineArticle } from "@/server/magazines/magazine-articles";
import type {
  IssueCard,
  IssuePageData,
  MagazineArticlePageData,
  MagazineCard,
  MagazineShelfData,
  MagazinesHomeData,
} from "@/server/magazines/reading";

export function autoDraftSettings(
  overrides: Partial<
    NonNullable<RouterOutputs["magazines"]["autoDraftSettings"]>
  > = {},
): NonNullable<RouterOutputs["magazines"]["autoDraftSettings"]> {
  return {
    settings: { ...DEFAULT_AUTO_DRAFT_SETTINGS, sources: resolveSources(null) },
    nextDraftAt: "2026-11-01T00:00:00.000Z",
    canManage: true,
    magazineDefaultVisibility: "members",
    hasTopics: true,
    communityIsPrivate: false,
    community: { slug: "night-owls", isListedInDirectory: true },
    ...overrides,
  };
}

export function issueHistoryEntry(
  detail: IssueHistoryEntry["detail"],
  overrides: Partial<IssueHistoryEntry> = {},
): IssueHistoryEntry {
  return {
    id: 1,
    detail,
    actorName: "Ada",
    issue: { id: 42, number: 7, title: "Community news", status: "draft" },
    createdAt: "2026-10-27T12:00:00.000Z",
    ...overrides,
  };
}

export function articleView(
  n: number,
  overrides: Partial<ArticleItemView["article"]> = {},
): ArticleItemView {
  return {
    kind: "article",
    itemId: `article-${n}`,
    intro: null,
    article: {
      id: n,
      slug: `article-${n}`,
      title: `Article ${n}`,
      authorName: `Author ${n}`,
      excerpt: `Excerpt of article ${n}.`,
      readingMinutes: 4,
      imageUrl: null,
      ...overrides,
    },
  };
}

/** A live AIT News story with the shared absolute date format. */
export function storylineView(
  n = 1,
  overrides: Partial<StorylineItemView["storyline"]> = {},
): StorylineItemView {
  return {
    kind: "storyline",
    itemId: `storyline-${n}`,
    intro: null,
    storyline: {
      slug: `story-${n}`,
      title: `Story ${n}`,
      overview: `Overview of story ${n}.`,
      sourceCount: 14,
      updatedAt: "2026-10-24T10:00:00.000Z",
      ...overrides,
    },
  };
}

/** A live headline with the shared absolute date format. */
export function newsItemView(
  n = 1,
  overrides: Partial<NewsItemView["news"]> = {},
): NewsItemView {
  return {
    kind: "newsItem",
    itemId: `news-${n}`,
    intro: null,
    news: {
      url: `https://www.example.com/news-${n}`,
      title: `Headline ${n}`,
      source: "example.com",
      publishedAt: "2026-11-01T10:00:00.000Z",
      summary: `Summary of headline ${n}.`,
      ...overrides,
    },
  };
}

/** A live community event with an absolute day. */
export function eventView(
  n = 1,
  overrides: Partial<EventItemView["event"]> = {},
): EventItemView {
  return {
    kind: "event",
    itemId: `event-${n}`,
    intro: null,
    membersOnly: false,
    event: {
      slug: `event-${n}`,
      title: `Event ${n}`,
      date: "2026-10-24T00:00:00.000Z",
      endDate: null,
      city: "Amsterdam",
      online: false,
      status: "published",
      ...overrides,
    },
  };
}

/** A live forum thread linked through its own community. */
export function forumThreadView(
  n = 1,
  overrides: Partial<ForumThreadItemView["thread"]> = {},
): ForumThreadItemView {
  return {
    kind: "forumThread",
    itemId: `thread-${n}`,
    intro: null,
    membersOnly: false,
    thread: {
      path: `/communities/local-builders/forum/thread-${n}`,
      title: `Thread ${n}`,
      replyCount: 42,
      authorName: "Sanne",
      lastActivityAt: "2026-10-24T10:00:00.000Z",
      ...overrides,
    },
  };
}

/** A live launchpad project with a plain-text pitch. */
export function launchpadProjectView(
  n = 1,
  overrides: Partial<LaunchpadProjectItemView["project"]> = {},
): LaunchpadProjectItemView {
  return {
    kind: "launchpadProject",
    itemId: `project-${n}`,
    intro: null,
    membersOnly: false,
    project: {
      slug: `project-${n}`,
      title: `Project ${n}`,
      pitch: "Build together.",
      stage: "prototype",
      voteCount: 120,
      authorName: "Sanne",
      ...overrides,
    },
  };
}

/** A Lexical document with one paragraph. */
export function lexicalParagraph(text: string): unknown {
  return {
    root: {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", text, format: 0 }],
        },
      ],
    },
  };
}

export function editorialView(
  n: number,
  overrides: Partial<EditorialItemView> = {},
): EditorialItemView {
  return {
    kind: "editorial",
    itemId: `editorial-${n}`,
    intro: null,
    heading: `Editorial ${n}`,
    body: lexicalParagraph(`Body of editorial ${n}.`),
    ...overrides,
  };
}

export function unavailableView(n: number): UnavailableItem {
  return {
    kind: "article",
    itemId: `gone-${n}`,
    unavailable: true,
    reason: "missing",
  };
}

export function issueCard(overrides: Partial<IssueCard> = {}): IssueCard {
  return {
    id: 7,
    number: 4,
    title: "The month agents learned to say no",
    slug: "issue-4",
    coverImageUrl: null,
    publishedAt: "2026-11-02T09:00:00.000Z",
    visibility: "public",
    effectiveVisibility: "public",
    magazine: { name: "Agents Weekly", slug: "agents-weekly", logoUrl: null },
    community: { name: "Amsterdam AI Builders", slug: "amsterdam-ai" },
    ...overrides,
  };
}

export function issuePage(
  overrides: Partial<Omit<IssuePageData, "issue">> & {
    issue?: Partial<IssuePageData["issue"]>;
  } = {},
): IssuePageData {
  const { issue, ...rest } = overrides;
  return {
    access: "full",
    magazine: {
      id: 3,
      name: "Agents Weekly",
      slug: "agents-weekly",
      logoUrl: null,
      description: "A monthly magazine about agents that work.",
      topics: ["agents"],
    },
    community: { name: "Amsterdam AI Builders", slug: "amsterdam-ai" },
    issue: {
      ...issueCard(),
      status: "published",
      editorNote: lexicalParagraph("Welcome to this issue."),
      signedBy: "Noa K.",
      layout: "cover-story",
      ...issue,
    },
    items: [articleView(1), editorialView(2), articleView(3)],
    pastIssues: [
      issueCard({ id: 6, number: 3, slug: "issue-3", title: "Issue three" }),
    ],
    readingMinutes: 8,
    ...rest,
  };
}

/** A Lexical document: an opening paragraph, then each heading with a paragraph. */
export function lexicalWithHeadings(
  opening: string,
  headings: string[],
): Article["content"] {
  const paragraph = (text: string) => ({
    type: "paragraph",
    version: 1,
    children: [{ type: "text", text, format: 0, version: 1 }],
  });
  return {
    root: {
      type: "root",
      version: 1,
      direction: "ltr",
      format: "",
      indent: 0,
      children: [
        paragraph(opening),
        ...headings.flatMap((text) => [
          {
            type: "heading",
            tag: "h2",
            version: 1,
            children: [{ type: "text", text, format: 0, version: 1 }],
          },
          paragraph(`More about ${text.toLowerCase()}.`),
        ]),
      ],
    },
  };
}

export function magazineArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 1,
    title: "Agents that know when to stop",
    slug: "agents-that-know-when-to-stop",
    content: lexicalWithHeadings("Every agent needs a way to say no.", [
      "Why agents refuse",
      "What changes for builders",
    ]),
    type: "article",
    authorName: "Sanne de Vries",
    authorType: "member",
    status: "published",
    publishedAt: "2026-11-02T09:00:00.000Z",
    magazine: 3,
    magazineIssue: 7,
    updatedAt: "2026-11-02T09:00:00.000Z",
    createdAt: "2026-10-20T09:00:00.000Z",
    ...overrides,
  };
}

export function articlePage(
  overrides: Partial<Omit<MagazineArticlePageData, "issue">> & {
    issue?: Partial<MagazineArticlePageData["issue"]>;
  } = {},
): MagazineArticlePageData {
  const { issue, ...rest } = overrides;
  const page = issuePage();
  return {
    access: "full",
    magazine: page.magazine,
    issue: { ...issueCard(), status: "published", ...issue },
    article: magazineArticle(),
    nextInIssue: articleView(2),
    ...rest,
  };
}

/** A magazine on the `/magazines` home with its newest public issue. */
export function magazineCard(
  n: number,
  overrides: Partial<MagazineCard> = {},
): MagazineCard {
  const slug = `magazine-${n}`;
  return {
    id: n,
    name: `Magazine ${n}`,
    slug,
    logoUrl: null,
    description: `About magazine ${n}.`,
    topics: ["agents"],
    community: { name: `Community ${n}`, slug: `community-${n}` },
    latest: issueCard({
      id: 100 + n,
      slug: `issue-of-${n}`,
      title: `Latest of magazine ${n}`,
      magazine: { name: `Magazine ${n}`, slug, logoUrl: null },
      community: { name: `Community ${n}`, slug: `community-${n}` },
    }),
    ...overrides,
  };
}

/** The `/magazines` home: a featured issue, four just published, two magazines. */
export function homeData(
  overrides: Partial<MagazinesHomeData> = {},
): MagazinesHomeData {
  return {
    featured: issueCard({
      id: 1,
      slug: "featured-issue",
      title: "Featured issue title",
      coverImageUrl: "https://example.test/cover.png",
    }),
    justPublished: [2, 3, 4, 5].map((n) =>
      issueCard({ id: n, slug: `issue-${n}`, title: `Just published ${n}` }),
    ),
    magazines: [
      magazineCard(1, { topics: ["agents", "evals"] }),
      magazineCard(2, { topics: ["robots"] }),
    ],
    topics: ["agents", "evals", "robots"],
    ...overrides,
  };
}

/** A magazine shelf: one members-only issue, then a public one. */
export function shelfData(
  overrides: Partial<MagazineShelfData> = {},
): MagazineShelfData {
  const page = issuePage();
  return {
    magazine: page.magazine,
    community: page.community,
    issues: [
      issueCard({
        id: 9,
        number: 5,
        slug: "issue-5",
        title: "For members",
        visibility: "members",
        effectiveVisibility: "members",
      }),
      issueCard(),
    ],
    viewerIsEditor: false,
    ...overrides,
  };
}

/** One unpublished article on a writer's desk. */
export function writerArticle(
  id: number,
  overrides: Partial<DraftMagazineArticle> = {},
): DraftMagazineArticle {
  return {
    id,
    slug: `story-${id}`,
    title: `Story ${id}`,
    reviewStatus: null,
    reviewNote: null,
    updatedAt: "2026-10-20T00:00:00.000Z",
    ...overrides,
  };
}
