import type { Block, CollectionConfig } from "payload";
import { BlocksFeature, CodeBlock, lexicalEditor } from "@payloadcms/richtext-lexical";

const ImageBlock: Block = {
  slug: "Image",
  fields: [
    { name: "src", type: "text", required: true },
    { name: "alt", type: "text" },
  ],
};
// Add bash to the language list (not in Monaco defaults, but Shiki supports it)
const codeLanguages = {
  bash: "Bash",
  css: "CSS",
  html: "HTML",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  plaintext: "Plain Text",
  python: "Python",
  shell: "Shell",
  sql: "SQL",
  typescript: "TypeScript",
  yaml: "YAML",
};

export const Articles: CollectionConfig = {
  slug: "articles",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "authorType", "reviewStatus", "publishedAt"],
  },
  versions: { drafts: true },
  hooks: {
    beforeChange: [
      async ({ data, originalDoc }) => {
        if (data?.authorType === "member") {
          if (
            data.reviewStatus === "approved" &&
            originalDoc?.reviewStatus !== "approved"
          ) {
            data.status = "published";
            data.publishedAt = data.publishedAt ?? new Date().toISOString();
          } else if (
            (data.reviewStatus === "rejected" || data.reviewStatus === "changes_requested") &&
            originalDoc?.reviewStatus !== data.reviewStatus
          ) {
            data.status = "draft";
            data.publishedAt = null;
          } else if (data.reviewStatus === "pending_review") {
            data.status = "draft";
            data.publishedAt = null;
          }
        }
        return data;
      },
    ],
    afterChange: [
      async ({ doc, previousDoc }) => {
        if (
          doc.authorType !== "member" ||
          !doc.authorId ||
          doc.reviewStatus === previousDoc?.reviewStatus
        ) {
          return;
        }

        const { db } = await import("@/server/db");
        const { logActivity } = await import("@/server/agent/activity");

        // Award XP and badges when admin approves a member article
        if (
          doc.reviewStatus === "approved" &&
          previousDoc?.reviewStatus !== "approved"
        ) {
          const { awardXp, checkArticleBadges, XP_AMOUNTS } = await import(
            "@/lib/gamification"
          );
          const { getPayloadClient } = await import("@/server/payload");

          await awardXp(db, doc.authorId, XP_AMOUNTS.ARTICLE_PUBLISHED);

          const payload = await getPayloadClient();
          const { totalDocs } = await payload.find({
            collection: "articles",
            where: {
              and: [
                { authorId: { equals: doc.authorId } },
                { status: { equals: "published" } },
                { reviewStatus: { equals: "approved" } },
              ],
            },
            limit: 0,
            depth: 0,
          });

          await checkArticleBadges(db, doc.authorId, totalDocs, doc.type);

          await logActivity(db, {
            actorId: doc.authorId,
            actorType: "member",
            action: "article.approved",
            targetType: "articles",
            targetId: String(doc.id),
            metadata: { title: doc.title, type: doc.type },
          });
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
      editor: lexicalEditor({
        features: ({ defaultFeatures }) => [
          ...defaultFeatures,
          BlocksFeature({ blocks: [CodeBlock({ languages: codeLanguages }), ImageBlock] }),
        ],
      }),
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
  ],
};
