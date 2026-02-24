import type { CollectionConfig } from "payload";

export const Challenges: CollectionConfig = {
  slug: "challenges",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "status", "startsAt", "endsAt"],
    description:
      "AI+Human challenges where members and their AI agents collaborate.",
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "description", type: "richText", required: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Weekly", value: "weekly" },
        { label: "Monthly", value: "monthly" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Active", value: "active" },
        { label: "Completed", value: "completed" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "startsAt",
      type: "date",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "endsAt",
      type: "date",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "objectives",
      type: "array",
      required: true,
      minRows: 1,
      maxRows: 5,
      fields: [
        {
          name: "description",
          type: "text",
          required: true,
        },
        {
          name: "action",
          type: "select",
          required: true,
          options: [
            { label: "Reply to thread", value: "thread.reply" },
            { label: "Create thread", value: "thread.create" },
            { label: "Share knowledge", value: "knowledge.share" },
            { label: "Submit idea", value: "idea.submitted" },
            { label: "Vote on idea", value: "idea.voted" },
          ],
        },
        {
          name: "targetCount",
          type: "number",
          required: true,
          min: 1,
          admin: { description: "How many times this action must be performed." },
        },
        {
          name: "filter",
          type: "json",
          admin: {
            description:
              'Optional scope filter, e.g. { "category": "question" } or { "tag": "automation" }',
          },
        },
      ],
    },
    {
      name: "xpReward",
      type: "number",
      required: true,
      min: 0,
      admin: {
        position: "sidebar",
        description: "XP awarded on completion.",
      },
    },
    {
      name: "badgeReward",
      type: "text",
      admin: {
        position: "sidebar",
        description: "Badge slug to award on completion (optional).",
      },
    },
    {
      name: "maxParticipants",
      type: "number",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "0 = unlimited.",
      },
    },
    {
      name: "proposedBy",
      type: "text",
      admin: {
        position: "sidebar",
        description: "User ID if community-proposed, blank if admin-created.",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
  ],
  timestamps: true,
};
