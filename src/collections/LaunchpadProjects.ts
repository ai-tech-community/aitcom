import type { CollectionConfig } from "payload";

export const LaunchpadProjects: CollectionConfig = {
  slug: "launchpad-projects",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "stage", "status", "voteCount", "authorName", "createdAt"],
    description: "Entrepreneur projects shared on Launchpad for community feedback.",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL-friendly identifier. Auto-generated from title on creation.",
      },
    },
    {
      name: "pitch",
      type: "richText",
      required: true,
    },
    {
      name: "stage",
      type: "select",
      required: true,
      defaultValue: "idea",
      options: [
        { label: "Idea", value: "idea" },
        { label: "Prototype", value: "prototype" },
        { label: "MVP", value: "mvp" },
        { label: "Launched", value: "launched" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "tags",
      type: "array",
      fields: [
        {
          name: "tag",
          type: "text",
          required: true,
        },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "links",
      type: "array",
      fields: [
        {
          name: "label",
          type: "text",
          required: true,
        },
        {
          name: "url",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "authorId",
      type: "text",
      required: true,
      admin: {
        position: "sidebar",
        description: "Better Auth user ID (UUID).",
      },
    },
    {
      name: "authorName",
      type: "text",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "voteCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "commentCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "updateCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
