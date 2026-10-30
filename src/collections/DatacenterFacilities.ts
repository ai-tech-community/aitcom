import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { httpsSourceUrl } from "@/lib/investigations/datacenter-facilities";
import { publishDatacenterFacilityFromRequest } from "@/server/datacenters/publish-facility";
import {
  DATACENTER_STATUS,
  PERMIT_KINDS,
  PERMIT_STATUS,
  type DatacenterStatus,
} from "@/server/db/schema";

const STATUS_LABELS: Record<DatacenterStatus, string> = {
  announced: "Announced",
  "under-construction": "Planned / under construction",
  operational: "Operating",
  expanding: "Expanding",
  decommissioned: "Decommissioned",
  cancelled: "Cancelled",
};

/**
 * Publishes the admin form onto the live facility row. Slug, source URL, and
 * checked-at on the Payload document are whatever the live row stored.
 */
export const publishFacilityBeforeChange: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
}) => {
  const merged: Record<string, unknown> = {
    ...(originalDoc ?? {}),
    ...(data ?? {}),
  };
  if (data?.permits === undefined && originalDoc) {
    merged.permits = (originalDoc as { permits?: unknown }).permits;
  }
  if (typeof merged.slug === "string" && merged.slug.trim() === "") {
    delete merged.slug;
  }
  const result = await publishDatacenterFacilityFromRequest(merged, req);
  if (!result.ok) throw new Error(result.error);
  return {
    ...(data ?? {}),
    slug: result.slug,
    sourceUrl: result.sourceUrl,
    checkedAt: result.checkedAt,
    status: result.status,
  };
};

/**
 * Staff editor for AI datacenter facilities. Saving upserts the live
 * `app.datacenter` row (same record the investigations pages read) matched by
 * slug, or by name and operator when the slug is new. Existing public slugs
 * are kept. No access overrides: only Payload admins reach this collection.
 */
export const DatacenterFacilities: CollectionConfig = {
  slug: "datacenter-facilities",
  dbName: "datacenter_facilities",
  admin: {
    group: "Investigations",
    useAsTitle: "name",
    defaultColumns: [
      "name",
      "operator",
      "country",
      "status",
      "capacityMw",
      "slug",
      "checkedAt",
    ],
    description:
      "Add or edit a facility on the investigations map. Leave slug empty to match an existing facility by name and operator, or paste its slug to edit that one. The public URL stays on that slug. An https source and the time you checked it are required.",
  },
  hooks: { beforeChange: [publishFacilityBeforeChange] },
  fields: [
    { name: "name", type: "text", required: true, maxLength: 200 },
    { name: "operator", type: "text", required: true, maxLength: 160 },
    {
      name: "country",
      type: "text",
      required: true,
      maxLength: 80,
      admin: { position: "sidebar", description: "Country code, such as US." },
    },
    {
      name: "city",
      type: "text",
      maxLength: 120,
      admin: { position: "sidebar" },
    },
    {
      name: "lat",
      type: "number",
      required: true,
      min: -90,
      max: 90,
      admin: { position: "sidebar" },
    },
    {
      name: "lng",
      type: "number",
      required: true,
      min: -180,
      max: 180,
      admin: { position: "sidebar" },
    },
    {
      name: "capacityMw",
      type: "number",
      min: 0,
      admin: {
        position: "sidebar",
        description: "Megawatts. Leave empty when unknown.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "announced",
      options: DATACENTER_STATUS.map((value) => ({
        label: STATUS_LABELS[value],
        value,
      })),
      admin: { position: "sidebar" },
    },
    {
      name: "sourceUrl",
      type: "text",
      required: true,
      validate: (value: string | null | undefined) =>
        httpsSourceUrl(value) ? true : "Source URL must be an https URL.",
      admin: { description: "Required https source for this facility." },
    },
    {
      name: "checkedAt",
      type: "date",
      required: true,
      admin: {
        position: "sidebar",
        description: "When this source was checked.",
        date: { pickerAppearance: "dayAndTime" },
      },
    },
    {
      name: "slug",
      type: "text",
      unique: true,
      admin: {
        position: "sidebar",
        description:
          "Public URL slug. Leave blank on create. An existing facility keeps its slug.",
      },
    },
    {
      name: "permits",
      type: "array",
      fields: [
        {
          name: "kind",
          type: "select",
          required: true,
          options: PERMIT_KINDS.map((value) => ({ label: value, value })),
        },
        { name: "issuingBody", type: "text", required: true, maxLength: 200 },
        {
          name: "status",
          type: "select",
          required: true,
          defaultValue: "granted",
          options: PERMIT_STATUS.map((value) => ({ label: value, value })),
        },
        { name: "appliedDate", type: "date" },
        { name: "issuedDate", type: "date" },
        {
          name: "sourceUrl",
          type: "text",
          validate: (value: string | null | undefined) => {
            if (value == null || value.trim() === "") return true;
            return httpsSourceUrl(value)
              ? true
              : "Permit source URL must be an https URL.";
          },
        },
      ],
    },
  ],
};
