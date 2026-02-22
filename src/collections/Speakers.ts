import type { CollectionConfig } from "payload";

export const Speakers: CollectionConfig = {
  slug: "speakers",
  admin: { useAsTitle: "name" },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "bio", type: "textarea", localized: true },
    { name: "company", type: "text" },
    { name: "photo", type: "upload", relationTo: "media" },
    { name: "linkedinUrl", type: "text" },
    { name: "githubUrl", type: "text" },
  ],
};
