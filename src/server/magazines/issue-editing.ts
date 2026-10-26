import { routing } from "@/i18n/routing";
import type { EditorItemView, ItemProblem } from "@/lib/magazines/item-views";
import type { MagazineIssue } from "@/payload-types";

import type { PayloadClient } from "./deps";
import {
  type IssueItemInput,
  loadIssueItemViews,
  type StoredBlock,
  toItemInputs,
  validateIssueItems,
} from "./items/registry";
import type { ItemContext } from "./items/types";
import { requireRelationId } from "./relation-id";

/**
 * Editor-side reads of issues: what the issue list and the issue builder
 * load. Editors see drafts and unavailable-item markers; nothing here is a
 * reader surface.
 */

/** One row of the editor's issue list. */
export type IssueListRow = Pick<
  MagazineIssue,
  | "id"
  | "number"
  | "title"
  | "slug"
  | "status"
  | "visibility"
  | "publishedAt"
  | "coverImageUrl"
  | "updatedAt"
>;

/** What the issue builder loads. */
export type IssueEditorView = {
  issue: MagazineIssue;
  /** The saved items as the editor sees them, markers included. */
  items: EditorItemView[];
  /** The saved items as builder input, block ids kept. */
  storedItems: IssueItemInput[];
  /** What would stop a publish now (preflight F7). */
  problems: ItemProblem[];
};

/**
 * The issue, when it exists and belongs to the community; otherwise null.
 * Callers answer NOT_FOUND for both, so an editor of one community cannot
 * learn which issue ids another community has.
 */
export async function findIssueInCommunity(
  payload: PayloadClient,
  issueId: number,
  communityId: string,
): Promise<MagazineIssue | null> {
  const issue = await payload.findByID({
    collection: "magazine-issues",
    id: issueId,
    depth: 0,
    disableErrors: true,
  });
  return issue?.communityId === communityId ? issue : null;
}

/** Every issue of the magazine, drafts included, newest number first. */
export async function listMagazineIssues(
  payload: PayloadClient,
  magazineId: number,
): Promise<IssueListRow[]> {
  const { docs } = await payload.find({
    collection: "magazine-issues",
    where: { magazine: { equals: magazineId } },
    sort: "-number",
    select: {
      number: true,
      title: true,
      slug: true,
      status: true,
      visibility: true,
      publishedAt: true,
      coverImageUrl: true,
      updatedAt: true,
    },
    depth: 0,
    pagination: false,
  });
  return docs.map((doc) => ({
    id: doc.id,
    number: Number(doc.number),
    title: doc.title,
    slug: doc.slug,
    status: doc.status,
    visibility: doc.visibility,
    publishedAt: doc.publishedAt ?? null,
    coverImageUrl: doc.coverImageUrl ?? null,
    updatedAt: doc.updatedAt,
  }));
}

function editorContext(
  payload: PayloadClient,
  issue: MagazineIssue,
): ItemContext {
  return {
    payload,
    magazineId: requireRelationId(issue.magazine),
    issueId: issue.id,
    // The editor API reads and writes the default locale, like the
    // articles router.
    locale: routing.defaultLocale,
    editor: true,
  };
}

/** The saved items of an issue as the editor sees them. */
export async function loadEditorItems(
  payload: PayloadClient,
  issue: MagazineIssue,
): Promise<EditorItemView[]> {
  const blocks = (issue.items ?? []) as StoredBlock[];
  return loadIssueItemViews(blocks, editorContext(payload, issue));
}

/** Everything the issue builder needs to edit one issue. */
export async function loadIssueEditorView(
  payload: PayloadClient,
  issue: MagazineIssue,
): Promise<IssueEditorView> {
  const blocks = (issue.items ?? []) as StoredBlock[];
  const ctx = editorContext(payload, issue);
  const [items, problems] = await Promise.all([
    loadIssueItemViews(blocks, ctx),
    validateIssueItems(blocks, ctx),
  ]);
  return { issue, items, storedItems: toItemInputs(blocks), problems };
}
