import type { CollectionConfig } from "payload";

export const PostReports: CollectionConfig = {
  slug: "post-reports",
  admin: {
    useAsTitle: "reason",
    defaultColumns: ["post", "reason", "reporterId", "createdAt"],
    description: "Member reports on community posts. One per reporter per post.",
  },
  indexes: [{ fields: ["post", "reporterId"], unique: true }],
  fields: [
    {
      name: "post",
      type: "relationship",
      relationTo: "feed-posts",
      required: true,
      index: true,
    },
    { name: "reporterId", type: "text", required: true, index: true },
    {
      name: "reason",
      type: "select",
      required: true,
      options: [
        { label: "Spam", value: "spam" },
        { label: "Inappropriate", value: "inappropriate" },
        { label: "Copyright", value: "copyright" },
        { label: "Other", value: "other" },
      ],
    },
    { name: "note", type: "text", maxLength: 500 },
    {
      // Set when a moderator restores the post. The row stays, so the same
      // reporter can't report it again; only open reports count and show.
      name: "dismissedAt",
      type: "date",
      index: true,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
