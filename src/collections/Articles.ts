import type { CollectionConfig } from "payload";
import { BlocksFeature, CodeBlock, lexicalEditor } from "@payloadcms/richtext-lexical";
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
          BlocksFeature({ blocks: [CodeBlock({ languages: codeLanguages })] }),
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
