import { createTranslator } from "next-intl";

import { loadMessages } from "@/i18n/messages";
import {
  communityMagazinePath,
  magazineArticleEditPath,
  magazineReviewPath,
} from "@/lib/magazines/paths";
import type { ReviewDecision } from "@/lib/magazines/review";
import type { MagazineRole } from "@/lib/magazines/roles";
import { clipText } from "@/lib/text-utils";
import { notifications } from "@/server/db/schema";

import type { Deps } from "./deps";

export const MAGAZINE_ROLE_ASSIGNED_NOTIFICATION = "magazine_role_assigned";
export const MAGAZINE_ARTICLE_SUBMITTED_NOTIFICATION =
  "magazine_article_submitted";
export const MAGAZINE_ARTICLE_REVIEWED_NOTIFICATION =
  "magazine_article_reviewed";

export type NoticeCommunity = { id: string; slug: string };

type MagazineNotice = {
  userId: string;
  type: string;
  title: string;
  content: string;
  communityId: string;
  path: string;
  linkLabel: string;
  extra?: Record<string, unknown>;
};

/**
 * Never fails the action that caused the notices. Pending text shares the
 * failure boundary with the one insert for all recipients.
 */
async function insertMagazineNotices(
  db: Deps["db"],
  notices: readonly MagazineNotice[] | Promise<readonly MagazineNotice[]>,
): Promise<void> {
  try {
    const rows = await notices;
    if (rows.length === 0) return;
    await db.insert(notifications).values(
      rows.map(({ path, linkLabel, extra, ...notice }) => ({
        ...notice,
        title: clipText(notice.title, 255),
        metadata: {
          reviewPath: path,
          linkLabel,
          communityId: notice.communityId,
          ...extra,
        },
      })),
    );
  } catch (error) {
    console.error("[magazines] notification failed", error);
  }
}

/** Inbox text is stored in English, following the badge notices. */
async function magazineNoticeTranslator() {
  return createTranslator({
    locale: "en",
    messages: await loadMessages("en"),
    namespace: "magazineEditor",
  });
}

export async function notifyRoleAssigned(
  db: Deps["db"],
  input: {
    userId: string;
    role: MagazineRole;
    magazineName: string;
    community: NoticeCommunity;
  },
): Promise<void> {
  await insertMagazineNotices(
    db,
    magazineNoticeTranslator().then((t) => [
      {
        userId: input.userId,
        type: MAGAZINE_ROLE_ASSIGNED_NOTIFICATION,
        title: t("notifications.roleAssigned.title", {
          magazine: input.magazineName,
        }),
        content: t(`notifications.roleAssigned.content.${input.role}`, {
          help: t(`roles.${input.role}.help`),
        }),
        communityId: input.community.id,
        path: communityMagazinePath(input.community.slug),
        linkLabel: t("notifications.roleAssigned.linkLabel"),
        extra: { magazineRole: input.role },
      },
    ]),
  );
}

export async function notifyArticleSubmitted(
  db: Deps["db"],
  input: {
    editorIds: readonly string[];
    authorName: string | null;
    articleTitle: string;
    articleSlug: string;
    magazineName: string;
    community: NoticeCommunity;
  },
): Promise<void> {
  await insertMagazineNotices(
    db,
    magazineNoticeTranslator().then((t) =>
      input.editorIds.map((userId) => ({
        userId,
        type: MAGAZINE_ARTICLE_SUBMITTED_NOTIFICATION,
        title: t("notifications.articleSubmitted.title", {
          author:
            input.authorName ?? t("notifications.articleSubmitted.author"),
          title: input.articleTitle,
          magazine: input.magazineName,
        }),
        content: t("notifications.articleSubmitted.content"),
        communityId: input.community.id,
        path: magazineReviewPath(input.community.slug, input.articleSlug),
        linkLabel: t("notifications.articleSubmitted.linkLabel"),
      })),
    ),
  );
}

export async function notifyArticleReviewed(
  db: Deps["db"],
  input: {
    authorId: string;
    decision: ReviewDecision;
    note: string | null;
    articleTitle: string;
    articleSlug: string;
    magazineName: string;
    community: NoticeCommunity;
  },
): Promise<void> {
  await insertMagazineNotices(
    db,
    magazineNoticeTranslator().then((t) => {
      const values = {
        title: input.articleTitle,
        magazine: input.magazineName,
      };
      const magazineLink = {
        path: communityMagazinePath(input.community.slug),
        linkLabel: t("notifications.articleReviewed.linkOpenMagazine"),
      };
      const copy = {
        approve: {
          title: t("notifications.articleReviewed.approved.title", values),
          content: t("notifications.articleReviewed.approved.content", values),
          ...magazineLink,
        },
        request_changes: {
          title: t(
            "notifications.articleReviewed.changesRequested.title",
            values,
          ),
          content: input.note ?? "",
          path: magazineArticleEditPath(
            input.community.slug,
            input.articleSlug,
          ),
          linkLabel: t("notifications.articleReviewed.linkOpenArticle"),
        },
        reject: {
          title: t("notifications.articleReviewed.rejected.title", values),
          content:
            input.note === null || input.note.length === 0
              ? t("notifications.articleReviewed.rejected.noNote", values)
              : input.note,
          ...magazineLink,
        },
      } satisfies Record<
        ReviewDecision,
        Pick<MagazineNotice, "title" | "content" | "path" | "linkLabel">
      >;
      return [
        {
          userId: input.authorId,
          type: MAGAZINE_ARTICLE_REVIEWED_NOTIFICATION,
          communityId: input.community.id,
          ...copy[input.decision],
        },
      ];
    }),
  );
}
