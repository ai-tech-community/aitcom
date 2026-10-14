import { z } from "zod";

const id = z.string().trim().min(1).max(255);
const optionalCopy = z.string().trim().max(2000).default("");
export const storylineRelations = [
  "shared_development",
  "builds_on",
  "contrasting_claims",
] as const;

export const isReservedStorylineSlug = (s: string) =>
  ["manage", "contribute", "drafts"].includes(s);
export const storylineSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .refine((s) => !isReservedStorylineSlug(s), "reservedSlug");

export const storylineInputSchema = z.object({
  id: id.optional(),
  sourceDraftId: id.optional(),
  slug: storylineSlugSchema,
  titleEn: z.string().trim().min(1).max(200),
  titleNl: z.string().trim().max(200).default(""),
  overviewEn: optionalCopy,
  overviewNl: optionalCopy,
  questionsEn: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  questionsNl: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  status: z.enum(["draft", "published"]),
  // Optimistic concurrency: a stale editor must not overwrite another save.
  revision: z.number().int().nonnegative().default(0),
  articles: z
    .array(
      z.object({
        articleId: id,
        noteEn: optionalCopy,
        noteNl: optionalCopy,
        evidence: z.string().trim().max(240),
      }),
    )
    .max(60),
  connections: z
    .array(
      z.object({
        targetId: id,
        relation: z.enum(storylineRelations),
        explanationEn: z.string().trim().min(1).max(1200),
        explanationNl: z.string().trim().max(1200).default(""),
        fromArticleId: id,
        toArticleId: id,
      }),
    )
    .max(20)
    .default([]),
});

export type StorylineInput = z.infer<typeof storylineInputSchema>;
export type StorylineArticle = {
  id: string;
  title: string;
  url: string;
  summary: string;
  author: string | null;
  publishedAt: Date | null;
};
export type StorylineMembership = StorylineInput["articles"][number] & {
  article: StorylineArticle;
};
export type StorylineCopy = Pick<
  StorylineInput,
  | "titleEn"
  | "titleNl"
  | "overviewEn"
  | "overviewNl"
  | "questionsEn"
  | "questionsNl"
>;

export function normalizeEvidence(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Source text only: a model's summary cannot serve as evidence. */
export function validStorylineEvidence(
  evidence: string,
  article: Pick<StorylineArticle, "title" | "summary">,
): boolean {
  const needle = normalizeEvidence(evidence);
  return (
    needle.length >= 12 &&
    evidence.length <= 240 &&
    [article.title, article.summary].some((text) =>
      normalizeEvidence(text).includes(needle),
    )
  );
}

export type PublicationIssue =
  | "overview"
  | "articles"
  | "duplicateArticle"
  | "missingArticle"
  | "note"
  | "evidence"
  | "duplicateConnection"
  | "selfConnection"
  | "connectionEvidence"
  | "connectionExplanation";
export function publicationIssues(
  input: StorylineInput,
  articles: readonly StorylineArticle[],
): PublicationIssue[] {
  const issues = new Set<PublicationIssue>();
  const byId = new Map(articles.map((a) => [a.id, a]));
  if (!input.overviewEn) issues.add("overview");
  if (input.articles.length < 2) issues.add("articles");
  if (
    new Set(input.articles.map((m) => m.articleId)).size !==
    input.articles.length
  )
    issues.add("duplicateArticle");
  for (const membership of input.articles) {
    const article = byId.get(membership.articleId);
    if (!article) issues.add("missingArticle");
    if (!membership.noteEn) issues.add("note");
    if (!article || !validStorylineEvidence(membership.evidence, article))
      issues.add("evidence");
  }
  const pairs = new Set<string>();
  for (const c of input.connections) {
    if (c.targetId === input.id) issues.add("selfConnection");
    const key = `${c.targetId}:${c.relation}`;
    if (pairs.has(key)) issues.add("duplicateConnection");
    pairs.add(key);
    if (!c.explanationEn.trim()) issues.add("connectionExplanation");
    if (
      !c.toArticleId ||
      !input.articles.some((m) => m.articleId === c.fromArticleId)
    )
      issues.add("connectionEvidence");
  }
  return [...issues];
}

export function storylineCopy(copy: StorylineCopy, locale: string) {
  const nl = locale === "nl";
  return {
    title: nl && copy.titleNl ? copy.titleNl : copy.titleEn,
    overview: nl && copy.overviewNl ? copy.overviewNl : copy.overviewEn,
    questions:
      nl && copy.questionsNl.length ? copy.questionsNl : copy.questionsEn,
    fallback:
      nl &&
      (!copy.titleNl ||
        !copy.overviewNl ||
        (!!copy.questionsEn.length && !copy.questionsNl.length)),
  };
}

export function storylineTimeline(memberships: readonly StorylineMembership[]) {
  const dated = memberships
    .filter((m) => m.article.publishedAt !== null)
    .sort(
      (a, b) =>
        a.article.publishedAt!.getTime() - b.article.publishedAt!.getTime() ||
        a.articleId.localeCompare(b.articleId),
    );
  const undated = memberships
    .filter((m) => m.article.publishedAt === null)
    .sort((a, b) => a.articleId.localeCompare(b.articleId));
  return { dated, undated, latestId: dated.at(-1)?.articleId ?? null };
}

export function storylineArticleHref(slug: string, articleId: string) {
  return `/news/stories/${encodeURIComponent(slug)}#article-${encodeURIComponent(articleId)}`;
}
