import { createTranslator } from "next-intl";

import { loadMessages } from "@/i18n/messages";
import type { ScheduleFailure } from "@/lib/magazines/issue-history";
import {
  communityMagazinePath,
  issueBuilderPath,
  issuePath,
  magazineArticleEditPath,
  magazineAutoDraftPath,
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
export const MAGAZINE_ISSUE_SCHEDULE_FAILED_NOTIFICATION =
  "magazine_issue_schedule_failed";

export {
  SCHEDULE_FAILURES,
  type ScheduleFailure,
} from "@/lib/magazines/issue-history";

export type NoticeCommunity = { id: string; slug: string };

export type MagazineNotice = {
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
    await insertMagazineNoticesIn(db, await notices);
  } catch (error) {
    console.error("[magazines] notification failed", error);
  }
}

/** Throws so a caller can roll notices and delivery claims back together. */
export async function insertMagazineNoticesIn(
  writer: Pick<Deps["db"], "insert">,
  notices: readonly MagazineNotice[],
): Promise<void> {
  if (notices.length === 0) return;
  await writer.insert(notifications).values(
    notices.map(({ path, linkLabel, extra, ...notice }) => ({
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
}

export const MAGAZINE_ISSUE_PUBLISHED_NOTIFICATION = "magazine_issue_published";

export async function issuePublishedNotices(input: {
  userIds: readonly string[];
  magazine: { id: number; name: string; slug: string };
  issue: { id: number; number: number; title: string; slug: string };
  community: NoticeCommunity;
}): Promise<MagazineNotice[]> {
  const t = await magazineNoticeTranslator("magazines");
  return input.userIds.map((userId) => ({
    userId,
    type: MAGAZINE_ISSUE_PUBLISHED_NOTIFICATION,
    title: t("notifications.issuePublished.title", {
      magazine: input.magazine.name,
      title: input.issue.title,
    }),
    content: t("notifications.issuePublished.content", {
      number: input.issue.number,
    }),
    communityId: input.community.id,
    path: issuePath(input.magazine, input.issue),
    linkLabel: t("notifications.issuePublished.linkLabel"),
    extra: { issueId: input.issue.id, magazineId: input.magazine.id },
  }));
}

/** Inbox text is stored in English, following the badge notices. */
async function magazineNoticeTranslator(
  namespace: "magazineEditor" | "magazines",
) {
  return createTranslator({
    locale: "en",
    messages: await loadMessages("en"),
    namespace,
  });
}

export async function notifyScheduleFailed(
  db: Deps["db"],
  input: {
    editorIds: readonly string[];
    reason: ScheduleFailure;
    issue: { id: number; title: string };
    magazineName: string;
    community: NoticeCommunity;
  },
): Promise<void> {
  await insertMagazineNotices(
    db,
    magazineNoticeTranslator("magazineEditor").then((t) => {
      const contentKeys = {
        empty: "notifications.scheduleFailed.content.empty",
        invalid_item: "notifications.scheduleFailed.content.invalid_item",
        no_rights: "notifications.scheduleFailed.content.no_rights",
        error: "notifications.scheduleFailed.content.error",
        auto_off: "notifications.scheduleFailed.content.auto_off",
      } as const satisfies Record<ScheduleFailure, string>;
      return input.editorIds.map((userId) => ({
        userId,
        type: MAGAZINE_ISSUE_SCHEDULE_FAILED_NOTIFICATION,
        title: t("notifications.scheduleFailed.title", {
          title: input.issue.title,
        }),
        content: t(contentKeys[input.reason], { magazine: input.magazineName }),
        communityId: input.community.id,
        path: issueBuilderPath(input.community.slug, input.issue.id),
        linkLabel: t("notifications.scheduleFailed.linkLabel"),
        extra: { reason: input.reason, issueId: input.issue.id },
      }));
    }),
  );
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
    magazineNoticeTranslator("magazineEditor").then((t) => [
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
    magazineNoticeTranslator("magazineEditor").then((t) =>
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
    magazineNoticeTranslator("magazineEditor").then((t) => {
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

export const MAGAZINE_AUTO_DRAFT_READY_NOTIFICATION =
  "magazine_auto_draft_ready";
export const MAGAZINE_AUTO_DRAFT_SKIPPED_NOTIFICATION =
  "magazine_auto_draft_skipped";

export async function notifyAutoDraftReady(
  db: Deps["db"],
  input: {
    editorIds: readonly string[];
    magazineName: string;
    issue: { id: number; title: string };
    itemCount: number;
    goesOutAt: string | null;
    community: NoticeCommunity;
  },
): Promise<void> {
  await insertMagazineNotices(
    db,
    magazineNoticeTranslator("magazineEditor").then((t) => {
      const content =
        input.goesOutAt === null
          ? t("notifications.autoDraftReady.content.notify", {
              count: input.itemCount,
            })
          : t("notifications.autoDraftReady.content.auto", {
              count: input.itemCount,
              date: new Intl.DateTimeFormat("en-GB", {
                dateStyle: "long",
                timeZone: "Europe/Amsterdam",
              }).format(new Date(input.goesOutAt)),
            });
      return input.editorIds.map((userId) => ({
        userId,
        type: MAGAZINE_AUTO_DRAFT_READY_NOTIFICATION,
        title: t("notifications.autoDraftReady.title", {
          magazine: input.magazineName,
        }),
        content,
        communityId: input.community.id,
        path: issueBuilderPath(input.community.slug, input.issue.id),
        linkLabel: t("notifications.autoDraftReady.linkLabel"),
        extra: {
          issueId: input.issue.id,
          itemCount: input.itemCount,
          goesOutAt: input.goesOutAt,
        },
      }));
    }),
  );
}

export async function notifyAutoDraftSkipped(
  db: Deps["db"],
  input: {
    editorIds: readonly string[];
    magazineName: string;
    reason: "too_few" | "no_rights";
    found: number | null;
    needed: number | null;
    community: NoticeCommunity;
  },
): Promise<void> {
  await insertMagazineNotices(
    db,
    magazineNoticeTranslator("magazineEditor").then((t) =>
      input.editorIds.map((userId) => ({
        userId,
        type: MAGAZINE_AUTO_DRAFT_SKIPPED_NOTIFICATION,
        title: t("notifications.autoDraftSkipped.title", {
          magazine: input.magazineName,
        }),
        content: t(`notifications.autoDraftSkipped.content.${input.reason}`, {
          found: input.found ?? 0,
          needed: input.needed ?? 0,
        }),
        communityId: input.community.id,
        path: magazineAutoDraftPath(input.community.slug),
        linkLabel: t("notifications.autoDraftSkipped.linkLabel"),
        extra: {
          reason: input.reason,
          found: input.found,
          needed: input.needed,
        },
      })),
    ),
  );
}
