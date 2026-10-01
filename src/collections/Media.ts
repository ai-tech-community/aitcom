import type { CollectionConfig } from "payload";

import { MEDIA_PURPOSES } from "@/lib/image-uploads";

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
  fields: [
    { name: "alt", type: "text", required: true },
    {
      name: "uploadedBy",
      type: "text",
      index: true,
      admin: {
        readOnly: true,
        description: "Better Auth user ID of the member who uploaded it.",
      },
    },
    {
      name: "purpose",
      type: "select",
      index: true,
      options: [...MEDIA_PURPOSES],
      admin: {
        readOnly: true,
        description:
          "What it was uploaded for. A feed post image belongs to one post and is deleted when the post stops using it. Empty for shared images (covers, logos).",
      },
    },
  ],
};
