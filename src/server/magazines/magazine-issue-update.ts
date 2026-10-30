import { TRPCError } from "@trpc/server";

import type { MagazineIssue } from "@/payload-types";
import { sharedMediaImage } from "@/server/communities/shared-media-url";
import { agentDrafts } from "@/server/db/schema";

import { articleBodyToLexical } from "./agent-article-body";
import type { Deps } from "./deps";
import {
  contentImageChoice,
  contentImageColumns,
  type ContentImageColumns,
  type ContentImageInput,
} from "@/server/content/content-image";

/** A cover or details change for an issue that is already published. */
export const MAGAZINE_ISSUE_UPDATE_DRAFT_TYPE = "magazine_issue_update";

export type MagazineIssueUpdate = {
  issueId: number;
  title?: string;
  coverImageUrl?: string | null;
  coverMediaId?: number | null;
  coverAlt?: string | null;
  editorNote?: string | null;
};

export async function resolveContentImage(
  payload: Deps["payload"],
  ownerId: string,
  input: ContentImageInput,
): Promise<ContentImageColumns | undefined> {
  const choice = contentImageChoice(input);
  if (choice.kind === "media") {
    const media = await sharedMediaImage(payload, choice.mediaId, ownerId);
    return contentImageColumns(choice, media);
  }
  return contentImageColumns(choice);
}

export async function proposePublishedIssueEdit(
  deps: Deps,
  identity: { agentId: string; ownerId: string },
  magazine: { id: number; slug: string; name: string },
  community: { id: string; slug: string; name: string },
  issue: MagazineIssue,
  patch: MagazineIssueUpdate,
): Promise<{ draftId: string }> {
  const draftId = crypto.randomUUID();
  await deps.db.insert(agentDrafts).values({
    id: draftId,
    agentId: identity.agentId,
    ownerId: identity.ownerId,
    type: MAGAZINE_ISSUE_UPDATE_DRAFT_TYPE,
    targetType: "magazine-issues",
    targetId: String(issue.id),
    status: "pending",
    content: patch.title?.trim() ? patch.title.trim() : issue.title,
    metadata: {
      issueId: issue.id,
      magazineId: magazine.id,
      magazineSlug: magazine.slug,
      communityId: community.id,
      communitySlug: community.slug,
      title: patch.title,
      coverImageUrl: patch.coverImageUrl,
      coverMediaId: patch.coverMediaId,
      coverAlt: patch.coverAlt,
      editorNote: patch.editorNote,
      destinationLabel: `${magazine.name} issue`,
      destinationPath: `/magazines/${magazine.slug}/${issue.slug}`,
    },
  });
  return { draftId };
}

function draftRecord(metadata: unknown): Record<string, unknown> | null {
  return metadata && typeof metadata === "object"
    ? (metadata as Record<string, unknown>)
    : null;
}

function optionalString(
  value: unknown,
  label: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `This issue draft has no usable ${label}.`,
    });
  }
  return value;
}

function optionalId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This issue draft has no usable cover.",
    });
  }
  return value;
}

export function magazineIssueUpdateFromDraft(draft: {
  metadata: unknown;
}): MagazineIssueUpdate {
  const meta = draftRecord(draft.metadata);
  const issueId = meta?.issueId;
  if (typeof issueId !== "number") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This issue draft has no issue.",
    });
  }
  const title = optionalString(meta?.title, "title");
  if (title === null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This issue draft has no usable title.",
    });
  }
  const coverImageUrl = optionalString(meta?.coverImageUrl, "cover");
  const coverAlt = optionalString(meta?.coverAlt, "cover description");
  const editorNote = optionalString(meta?.editorNote, "editor note");
  const coverMediaId = optionalId(meta?.coverMediaId);
  return {
    issueId,
    ...(title !== undefined ? { title } : {}),
    ...(coverImageUrl !== undefined ? { coverImageUrl } : {}),
    ...(coverMediaId !== undefined ? { coverMediaId } : {}),
    ...(coverAlt !== undefined ? { coverAlt } : {}),
    ...(editorNote !== undefined ? { editorNote } : {}),
  };
}

export async function applyMagazineIssueUpdate(
  payload: Deps["payload"],
  update: MagazineIssueUpdate,
): Promise<void> {
  const data: {
    title?: string;
    coverImageUrl?: string | null;
    coverMediaId?: number | null;
    coverAlt?: string | null;
    editorNote?: MagazineIssue["editorNote"];
  } = {};
  if (update.title !== undefined) data.title = update.title;
  if (update.coverImageUrl !== undefined)
    data.coverImageUrl = update.coverImageUrl;
  if (update.coverMediaId !== undefined)
    data.coverMediaId = update.coverMediaId;
  if (update.coverAlt !== undefined) data.coverAlt = update.coverAlt;
  if (update.editorNote !== undefined) {
    data.editorNote =
      update.editorNote === null
        ? null
        : (articleBodyToLexical(
            update.editorNote,
          ) as MagazineIssue["editorNote"]);
  }
  await payload.update({
    collection: "magazine-issues",
    id: update.issueId,
    depth: 0,
    data,
  });
}
