import { z } from "zod";
import {
  publicationIssues,
  storylineInputSchema,
  type StorylineInput,
  type StorylineArticle,
} from "./storylines";

/** The model supplies editorial copy and references, never storage IDs or status. */
export const storylineProposalSchema = z.object({
  slug: storylineInputSchema.shape.slug,
  titleEn: storylineInputSchema.shape.titleEn,
  overviewEn: z.string().trim().min(1).max(2000),
  questionsEn: storylineInputSchema.shape.questionsEn,
  articles: z
    .array(
      z.object({
        articleId: z.string().min(1).max(255),
        noteEn: z.string().trim().min(1).max(2000),
        evidence: z.string().trim().min(12).max(240),
      }),
    )
    .min(2)
    .max(10),
});

export const storylineProposalResponseSchema = z.object({
  proposals: z.array(storylineProposalSchema).max(3),
});

export type StorylineSuggestion = {
  input: StorylineInput;
  articles: StorylineArticle[];
};

/** Invalid proposals are discarded independently so one bad group cannot taint another. */
export function validateStorylineProposals(
  raw: unknown,
  candidates: readonly StorylineArticle[],
  occupiedSlugs: ReadonlySet<string> = new Set(),
) {
  const root = z
    .object({ proposals: z.array(z.unknown()).max(3) })
    .safeParse(raw);
  if (!root.success)
    return { drafts: [] as StorylineSuggestion[], discarded: 1 };
  const byId = new Map(candidates.map((a) => [a.id, a]));
  const usedArticles = new Set<string>();
  const slugs = new Set(occupiedSlugs);
  const drafts: StorylineSuggestion[] = [];
  let discarded = 0;
  for (const rawProposal of root.data.proposals) {
    const proposal = storylineProposalSchema.safeParse(rawProposal);
    if (!proposal.success) {
      discarded += 1;
      continue;
    }
    const input = storylineInputSchema.parse({
      ...proposal.data,
      status: "draft",
      revision: 0,
      connections: [],
    });
    const articles = input.articles.flatMap((m) => {
      const a = byId.get(m.articleId);
      return a ? [a] : [];
    });
    if (
      publicationIssues(input, articles).length ||
      input.articles.some((m) => usedArticles.has(m.articleId)) ||
      slugs.has(input.slug)
    ) {
      discarded += 1;
      continue;
    }
    slugs.add(input.slug);
    for (const m of input.articles) usedArticles.add(m.articleId);
    drafts.push({ input, articles });
  }
  return { drafts, discarded };
}
