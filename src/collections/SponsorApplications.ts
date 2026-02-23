import type { CollectionConfig } from "payload";

export const SponsorApplications: CollectionConfig = {
  slug: "sponsor-applications",
  admin: {
    useAsTitle: "companyName",
    defaultColumns: ["companyName", "tier", "status", "appliedAt"],
  },
  fields: [
    { name: "companyName", type: "text", required: true },
    { name: "website", type: "text" },
    { name: "contactName", type: "text", required: true },
    { name: "contactEmail", type: "email", required: true },
    {
      name: "tier",
      type: "select",
      required: true,
      options: [
        { label: "Gold", value: "gold" },
        { label: "Silver", value: "silver" },
        { label: "Bronze", value: "bronze" },
      ],
    },
    { name: "message", type: "textarea" },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "In Review", value: "in_review" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "notes",
      type: "textarea",
      admin: { description: "Internal notes (not visible to applicant)" },
    },
    {
      name: "appliedAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === "create" && data) {
          data.appliedAt = new Date().toISOString();
        }
        return data;
      },
    ],
  },
};
