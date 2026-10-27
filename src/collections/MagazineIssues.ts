import type { CollectionConfig } from "payload";

import {
  ISSUE_LAYOUTS,
  ISSUE_LAYOUT_LABELS,
  ISSUE_STATUSES,
  ISSUE_STATUS_LABELS,
  ISSUE_VISIBILITIES,
  ISSUE_VISIBILITY_LABELS,
  PUBLISH_ORIGINS,
  SCHEDULE_ORIGINS,
} from "@/lib/magazines/values";
import { ISSUE_ITEM_BLOCKS } from "@/server/magazines/items/blocks";

import { articleRichTextEditor } from "./shared/article-rich-text";

/**
 * One issue of a community magazine (spec 2026-10-26, ADR-0042/0043). Its
 * `items` are blocks built from the item registry. `visibility` is a concrete
 * value copied from the magazine default at creation. No access overrides:
 * only Payload admins reach it over Payload's own API; readers go through the
 * access resolver in server code.
 */
export const MagazineIssues: CollectionConfig = {
  slug: "magazine-issues",
  admin: {
    group: "Magazines",
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "magazine",
      "number",
      "status",
      "scheduledFor",
      "visibility",
      "publishedAt",
    ],
  },
  indexes: [
    { fields: ["magazine", "slug"], unique: true },
    { fields: ["magazine", "number"], unique: true },
  ],
  fields: [
    {
      name: "magazine",
      type: "relationship",
      relationTo: "magazines",
      required: true,
      index: true,
    },
    { name: "communityId", type: "text", required: true, index: true },
    { name: "number", type: "number", required: true },
    { name: "title", type: "text", required: true, localized: true },
    { name: "slug", type: "text", required: true },
    { name: "coverImageUrl", type: "text" },
    {
      name: "editorNote",
      type: "richText",
      localized: true,
      editor: articleRichTextEditor,
    },
    {
      name: "layout",
      type: "select",
      defaultValue: "cover-story",
      options: ISSUE_LAYOUTS.map((value) => ({
        label: ISSUE_LAYOUT_LABELS[value],
        value,
      })),
    },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "members",
      index: true,
      options: ISSUE_VISIBILITIES.map((value) => ({
        label: ISSUE_VISIBILITY_LABELS[value],
        value,
      })),
    },
    {
      name: "publicConfirmedBy",
      type: "text",
      admin: {
        description:
          "Who confirmed public visibility for an unlisted community (Better Auth user ID).",
      },
    },
    { name: "publicConfirmedAt", type: "date" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      index: true,
      options: ISSUE_STATUSES.map((value) => ({
        label: ISSUE_STATUS_LABELS[value],
        value,
      })),
    },
    { name: "publishedAt", type: "date", index: true },
    {
      name: "publishedBy",
      type: "text",
      admin: { description: "Better Auth user ID." },
    },
    {
      name: "scheduledFor",
      type: "date",
      index: true,
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "scheduledBy",
      type: "text",
      admin: {
        description:
          "Who scheduled it (Better Auth user ID). The scheduled publish runs as this person.",
      },
    },
    {
      name: "scheduledVia",
      type: "select",
      options: SCHEDULE_ORIGINS.map((value) => ({ label: value, value })),
      admin: {
        readOnly: true,
        description:
          "Who set the schedule: a person, or automatic drafts. A person's change stops an automatic schedule.",
      },
    },
    {
      name: "publishedVia",
      type: "select",
      options: PUBLISH_ORIGINS.map((value) => ({ label: value, value })),
      admin: {
        readOnly: true,
        description:
          "How it was published: the Publish button, a schedule, or automatically.",
      },
    },
    { name: "items", type: "blocks", blocks: ISSUE_ITEM_BLOCKS },
  ],
};
