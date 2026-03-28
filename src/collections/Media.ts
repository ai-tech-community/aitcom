import type { CollectionConfig } from "payload";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    read: () => true,
  },
  admin: { useAsTitle: "alt" },
  upload: {
    mimeTypes: ["image/*"],
    imageSizes: [
      { name: "thumbnail", width: 300, height: 300, position: "centre" },
      { name: "card", width: 768, height: 432, position: "centre" },
      { name: "hero", width: 1440, height: 600, position: "centre" },
    ],
  },
  fields: [{ name: "alt", type: "text", required: true }],
};
