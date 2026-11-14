/**
 * Test support: object storage without S3. Links are made from the key, so
 * tests can see which file was linked; nothing is ever fetched or stored.
 */
import type { ObjectStorage } from "@/server/media/object-storage";

export const testObjectStorage: ObjectStorage = {
  presignUpload: async () => {
    throw new Error("no uploads in these tests");
  },
  inspect: async () => null,
  signedGetUrl: async (key: string) => `https://signed.test/${key}`,
  publicUrl: (key: string) => `https://public.test/${key}`,
  // An empty bucket: nothing to list.
  async *list() {
    yield* [];
  },
  remove: async () => undefined,
};
