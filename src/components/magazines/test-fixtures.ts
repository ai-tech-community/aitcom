/**
 * Test data for the magazine reading components: item views and issue pages
 * shaped exactly like the read models (`src/server/magazines/reading.ts`).
 */
import type {
  ArticleItemView,
  EditorialItemView,
  UnavailableItem,
} from "@/lib/magazines/item-views";
import type { IssueCard, IssuePageData } from "@/server/magazines/reading";

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
    itemCount: 2,
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
