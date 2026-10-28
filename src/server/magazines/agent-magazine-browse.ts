/**
 * Browse decisions that must not depend on which row a draft query returns.
 *
 * `submissionsVisible` used to be false whenever `magazineSlug` was omitted
 * and true for any claimed owner when it was set. Browsing a community and
 * browsing that community's magazine are the same question, so the flag
 * flipped when a later call added the slug. It is standing only: an editor
 * sees the pending queue, a claimed owner sees their own pending
 * submissions, and anyone else sees none.
 *
 * Who counts as an editor is decided in `editorScopeOf`. Two staff rows for
 * one community used to keep whichever row the query returned last, which
 * swapped this flag (and the queue versus the owner's own list) between
 * identical calls.
 */
export function submissionsAreVisible(
  editor: boolean,
  ownerId: string | null,
): boolean {
  return editor || ownerId !== null;
}

type IssueRow = { id: number; number: number };
type IdRow = { id: number };

/** One community, every magazine on the page, in a stable order. */
export function mergeCommunityMagazineBrowse<
  TIssue extends IssueRow,
  TArticle extends IdRow,
  TSubmission extends IdRow,
>(input: {
  magazines: { id: number; slug: string }[];
  details: {
    issues: TIssue[];
    articles: TArticle[];
    submissions: TSubmission[];
  }[];
  page: number;
  yourDrafts: { magazineSlug: string }[];
  submissionsVisible: boolean;
}) {
  const slugs = new Set(input.magazines.map((magazine) => magazine.slug));
  return {
    magazines: input.magazines,
    page: input.page,
    issues: input.details
      .flatMap((detail) => detail.issues)
      .sort((a, b) => b.number - a.number || a.id - b.id),
    articles: dedupeById(input.details.flatMap((detail) => detail.articles)),
    submissions: dedupeById(
      input.details.flatMap((detail) => detail.submissions),
    ),
    submissionsVisible: input.submissionsVisible,
    yourDrafts: input.yourDrafts.filter((draft) =>
      slugs.has(draft.magazineSlug),
    ),
  };
}

function dedupeById<T extends IdRow>(items: T[]): T[] {
  const byId = new Map<number, T>();
  for (const item of items) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}
