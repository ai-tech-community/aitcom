import type { CollectionConfig } from "payload";

import {
  ISSUE_VISIBILITIES,
  ISSUE_VISIBILITY_LABELS,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";

/**
 * A community's magazine (spec 2026-10-26, ADR-0043). One per community: the
 * unique `communityId` index makes that a database rule. No access
 * overrides: only Payload admins reach it over Payload's own API; the site
 * reads and writes through server code.
 */
export const Magazines: CollectionConfig = {
  slug: "magazines",
  admin: {
    group: "Magazines",
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "communityId", "defaultVisibility"],
  },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 120 },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    {
      name: "communityId",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    { name: "description", type: "textarea", maxLength: 500 },
    { name: "logoUrl", type: "text" },
    {
      name: "topics",
      type: "array",
      maxRows: MAX_MAGAZINE_TOPICS,
      fields: [{ name: "topic", type: "text" }],
    },
    {
      name: "defaultVisibility",
      type: "select",
      defaultValue: "members",
      options: ISSUE_VISIBILITIES.map((value) => ({
        label: ISSUE_VISIBILITY_LABELS[value],
        value,
      })),
      admin: { description: "Copied to each new issue." },
    },
    {
      name: "publicConfirmedBy",
      type: "text",
      admin: {
        description:
          "Who confirmed a public default for an unlisted community (Better Auth user ID).",
      },
    },
    { name: "publicConfirmedAt", type: "date" },
    {
      name: "createdBy",
      type: "text",
      required: true,
      admin: { description: "Better Auth user ID." },
    },
  ],
};
