import type { CollectionConfig } from "payload";

import {
  assertMagazineUnchanged,
  channelFor,
} from "@/server/articles/channels";

import { articleRichTextEditor } from "./shared/article-rich-text";

export const Articles: CollectionConfig = {
  slug: "articles",
  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "type",
      "status",
      "authorType",
      "reviewStatus",
      "publishedAt",
    ],
  },
  versions: { drafts: true },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        // An issue's article block keeps a required reference: refuse the
        // delete with ARTICLE_PLACED (every path: site, admin, scripts)
        // instead of a raw foreign-key error.
        const { assertArticleNotPlaced } =
          await import("@/server/magazines/article-placement");
        await assertArticleNotPlaced(req.payload, Number(id), req);
      },
    ],
    beforeChange: [
      async ({ data, operation, originalDoc }) => {
        // By now Payload's field beforeValidate has filled every field the
        // update left out from the saved doc, so `data` is the whole
        // article, `magazine` included.
        // On create `originalDoc` is `{}` (or the source of a duplicate):
        // only an update can move an article between channels.
        assertMagazineUnchanged(
          data,
          operation === "update" ? originalDoc : undefined,
        );
        if (data.authorType === "member") {
          channelFor(data).onReviewChange(data, originalDoc);
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        if (
          doc.authorType !== "member" ||
          !doc.authorId ||
          doc.reviewStatus === previousDoc?.reviewStatus
        ) {
          return;
        }

        const { db } = await import("@/server/db");
        const { logActivity } = await import("@/server/agent/activity");

        // The blog publishes and credits on approval; a magazine credits
        // when an issue holding the article is published.
        if (
          doc.reviewStatus === "approved" &&
          previousDoc?.reviewStatus !== "approved" &&
          channelFor(doc).creditsOnApproval
        ) {
          const { creditArticlePublication } =
            await import("@/server/articles/credit");
          // The one place blog approval XP is granted: an admin approval
          // and a trusted author's direct publish both pass through here.
          await creditArticlePublication(
            db,
            {
              id: doc.id,
              authorId: doc.authorId,
              type: doc.type,
              title: doc.title,
            },
            { action: "article.approved", req },
          );
        }

        // Notify member when changes are requested
        if (doc.reviewStatus === "changes_requested") {
          await logActivity(db, {
            actorId: doc.authorId,
            actorType: "member",
            action: "article.changes_requested",
            targetType: "articles",
            targetId: String(doc.id),
            metadata: {
              title: doc.title,
              reviewNote: doc.reviewNote,
            },
          });
        }

        // Notify member when article is rejected
        if (doc.reviewStatus === "rejected") {
          await logActivity(db, {
            actorId: doc.authorId,
            actorType: "member",
            action: "article.rejected",
            targetType: "articles",
            targetId: String(doc.id),
            metadata: {
              title: doc.title,
              reviewNote: doc.reviewNote,
            },
          });
        }
      },
    ],
  },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    { name: "slug", type: "text", required: true, unique: true },
    {
      name: "content",
      type: "richText",
      required: true,
      localized: true,
      editor: articleRichTextEditor,
    },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Article", value: "article" },
        { label: "Tutorial", value: "tutorial" },
        { label: "Talk Recording", value: "talk_recording" },
      ],
    },
    {
      name: "tags",
      type: "array",
      fields: [{ name: "tag", type: "text", required: true }],
    },
    { name: "mediaUrl", type: "text" },
    { name: "authorId", type: "text", admin: { position: "sidebar" } },
    { name: "authorName", type: "text", admin: { position: "sidebar" } },
    {
      name: "authorType",
      type: "select",
      defaultValue: "admin",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Member", value: "member" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "reviewStatus",
      type: "select",
      options: [
        { label: "Pending Review", value: "pending_review" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
        { label: "Changes Requested", value: "changes_requested" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "reviewNote", type: "textarea", admin: { position: "sidebar" } },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "publishedAt", type: "date", admin: { position: "sidebar" } },
    {
      name: "magazine",
      type: "relationship",
      relationTo: "magazines",
      index: true,
      // Fixed at create: the hook refuses a change (ARTICLE_MAGAZINE_LOCKED),
      // so the admin panel shows it read-only on an existing article.
      access: { update: () => false },
      admin: {
        position: "sidebar",
        description: "Set for articles written for a community magazine.",
      },
    },
    {
      name: "magazineIssue",
      type: "relationship",
      relationTo: "magazine-issues",
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Set by the issue builder",
      },
    },
    {
      // Exactly-once magazine credit (ADR-0043): set when the author is
      // credited for this article's publication in an issue. Only server
      // code writes it; nobody can clear it over Payload's API (a cleared
      // marker would credit the author twice).
      name: "magazineCreditedAt",
      type: "date",
      access: { update: () => false },
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "When the author was credited for the magazine publication",
      },
    },
  ],
};
