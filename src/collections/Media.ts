import type { CollectionConfig } from "payload";

import { MEDIA_PURPOSES } from "@/lib/image-uploads";
import { unlinkFeedPostsBeforeMediaDelete } from "@/server/communities/feed-post-image-url-hook";
import {
  holdBackCallerPrefix,
  noPrefixWrites,
  readMissingPrefixAsBucketRoot,
  storeNewFilesUnderAFolder,
} from "@/server/media/media-prefix";

import { adminsOnly } from "./shared/admins-only";

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
      // Uncropped, for feed pictures: their tiles never need the original.
      { name: "feed", width: 1200, withoutEnlargement: true },
    ],
  },
  hooks: {
    beforeOperation: [holdBackCallerPrefix],
    // Runs before the storage plugin's hooks, which are appended after these.
    beforeChange: [storeNewFilesUnderAFolder],
    beforeDelete: [unlinkFeedPostsBeforeMediaDelete()],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      // Required for shared uploads (covers, logos). A feed post picture's
      // description is its author's to write, and may be left empty.
      validate: (value: unknown, { siblingData }: { siblingData: unknown }) =>
        (siblingData as { purpose?: string | null }).purpose === "feed-post" ||
        (typeof value === "string" && value.trim().length > 0) ||
        "Describe the image.",
    },
    // Who uploaded what is for Payload admins, not the public media API.
    {
      name: "uploadedBy",
      type: "text",
      index: true,
      access: { read: adminsOnly },
      admin: {
        readOnly: true,
        description: "Better Auth user ID of the member who uploaded it.",
      },
    },
    {
      name: "purpose",
      type: "select",
      index: true,
      access: { read: adminsOnly },
      options: [...MEDIA_PURPOSES],
      admin: {
        readOnly: true,
        description:
          "What it was uploaded for. A feed post image belongs to one post and is deleted when the post stops using it. Empty for shared images (covers, logos).",
      },
    },
    // The S3 folder of the file. The storage plugin owns this field (hidden,
    // read-only, default "") and merges this definition into its own. Only
    // the Media hooks set it (see src/server/media/media-prefix.ts).
    {
      name: "prefix",
      type: "text",
      access: { create: noPrefixWrites, update: noPrefixWrites },
      hooks: { afterRead: [readMissingPrefixAsBucketRoot] },
    },
  ],
};
