import type { CollectionConfig } from "payload";

import {
  EVENT_AUDIENCE_LABELS,
  EVENT_AUDIENCE_OPTIONS,
  EVENT_FOCUS_LABELS,
  EVENT_FOCUS_OPTIONS,
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_LEVEL_LABELS,
  EVENT_LEVEL_OPTIONS,
  EVENT_REVIEW_STATUS_LABELS,
  EVENT_REVIEW_STATUS_OPTIONS,
} from "@/lib/event-metadata";

export const Events: CollectionConfig = {
  slug: "events",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "date", "status", "reviewStatus"],
  },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "description", type: "richText", required: true, localized: true },
    {
      type: "tabs",
      tabs: [
        {
          label: "Basics",
          fields: [
            {
              name: "summary",
              type: "textarea",
              localized: true,
              admin: {
                description:
                  "Short event summary for cards, SEO, and agent curation.",
              },
            },
            {
              name: "type",
              type: "select",
              required: true,
              options: [
                { label: "Workshop", value: "workshop" },
                { label: "Hackathon", value: "hackathon" },
                { label: "Deep Dive", value: "deep_dive" },
                { label: "Meetup", value: "meetup" },
              ],
            },
            {
              name: "format",
              type: "select",
              options: EVENT_FORMAT_OPTIONS.map((value) => ({
                label: EVENT_FORMAT_LABELS[value],
                value,
              })),
              admin: {
                description: "How attendees join this event.",
              },
            },
            {
              name: "location",
              type: "text",
              required: true,
            },
            {
              type: "row",
              fields: [
                { name: "region", type: "text" },
                { name: "country", type: "text" },
                { name: "city", type: "text" },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "date",
                  type: "date",
                  required: true,
                  admin: { width: "50%" },
                },
                { name: "startTime", type: "text", admin: { width: "25%" } },
                { name: "endTime", type: "text", admin: { width: "25%" } },
              ],
            },
            { name: "maxAttendees", type: "number" },
            {
              name: "price",
              type: "number",
              admin: {
                description:
                  "Price in EUR cents (e.g. 1500 = €15.00). Leave empty for free events.",
              },
            },
          ],
        },
        {
          label: "Discovery & classification",
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "focus",
                  type: "select",
                  options: EVENT_FOCUS_OPTIONS.map((value) => ({
                    label: EVENT_FOCUS_LABELS[value],
                    value,
                  })),
                },
                {
                  name: "level",
                  type: "select",
                  options: EVENT_LEVEL_OPTIONS.map((value) => ({
                    label: EVENT_LEVEL_LABELS[value],
                    value,
                  })),
                },
                {
                  name: "aitFitScore",
                  type: "number",
                  min: 1,
                  max: 10,
                  admin: {
                    description: "1-10 relevance score for AIT Community.",
                  },
                },
              ],
            },
            {
              name: "audience",
              type: "select",
              hasMany: true,
              options: EVENT_AUDIENCE_OPTIONS.map((value) => ({
                label: EVENT_AUDIENCE_LABELS[value],
                value,
              })),
            },
            {
              name: "tags",
              type: "array",
              admin: {
                description: "Optional keyword tags for search and curation.",
              },
              fields: [{ name: "tag", type: "text", required: true }],
            },
            {
              type: "row",
              fields: [
                { name: "sourceUrl", type: "text" },
                { name: "discoverySource", type: "text" },
              ],
            },
            {
              type: "row",
              fields: [
                {
                  name: "curatedByAgent",
                  type: "checkbox",
                  defaultValue: false,
                },
                { name: "confidenceScore", type: "number", min: 0, max: 1 },
                {
                  name: "lastVerifiedAt",
                  type: "date",
                  admin: { date: { pickerAppearance: "dayAndTime" } },
                },
              ],
            },
            {
              name: "reviewStatus",
              type: "select",
              defaultValue: "approved",
              options: EVENT_REVIEW_STATUS_OPTIONS.map((value) => ({
                label: EVENT_REVIEW_STATUS_LABELS[value],
                value,
              })),
              admin: {
                description:
                  "Curation lifecycle; separate from publish status so existing flows keep working.",
              },
            },
          ],
        },
        {
          label: "Media",
          fields: [
            {
              name: "image",
              type: "upload",
              relationTo: "media",
              admin: {
                description:
                  "Legacy/compatible event image. Existing events continue using this.",
              },
            },
            {
              name: "coverImage",
              type: "upload",
              relationTo: "media",
              admin: {
                description: "Primary hero image for the event page.",
              },
            },
            {
              name: "gallery",
              type: "upload",
              relationTo: "media",
              hasMany: true,
            },
            { name: "videoUrl", type: "text" },
          ],
        },
        {
          label: "Relations",
          fields: [
            {
              name: "speakers",
              type: "relationship",
              relationTo: "speakers",
              hasMany: true,
            },
          ],
        },
      ],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Completed", value: "completed" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
    },
  ],
};
