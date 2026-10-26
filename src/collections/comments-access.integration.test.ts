// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PayloadClient } from "@/server/magazines/deps";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}
const RUN_DB = isLocalDbConfigured();

/**
 * Comments are as private as their article (ADR-0042). The app reads them
 * through the Local API after `canReadArticle`; Payload's REST and GraphQL
 * routes (which run the collection's access with no app session) must not
 * hand them to anyone but a signed-in Payload admin.
 */
describe.skipIf(!RUN_DB)("comments read access [DB integration]", () => {
  let payload: PayloadClient;
  // Far above any real article id: the comment is never shown anywhere.
  const articleId = 900_000_000 + Math.floor(Math.random() * 1e6);
  let commentId: number;

  beforeAll(async () => {
    const { getPayloadClient } = await import("@/server/payload");
    payload = await getPayloadClient();
    const doc = await payload.create({
      collection: "comments",
      data: {
        articleId,
        content: "a members-only remark",
        authorId: `comments-access-${articleId}`,
        authorName: "Member",
      },
    });
    commentId = doc.id;
  }, 120_000);

  afterAll(async () => {
    if (commentId) {
      await payload.delete({ collection: "comments", id: commentId });
    }
  });

  it("refuses an anonymous read through Payload's access (the REST/GraphQL path)", async () => {
    await expect(
      payload.find({
        collection: "comments",
        where: { articleId: { equals: articleId } },
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payload.findByID({
        collection: "comments",
        id: commentId,
        overrideAccess: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("lets a signed-in Payload admin read them, and the app's Local API reads stay open", async () => {
    const asAdmin = await payload.find({
      collection: "comments",
      where: { articleId: { equals: articleId } },
      overrideAccess: false,
      user: { id: 1, collection: "users" } as never,
    });
    expect(asAdmin.docs.map((d) => d.id)).toEqual([commentId]);

    const { listArticleComments } =
      await import("@/server/articles/article-comments");
    const listed = await listArticleComments(payload, articleId);
    expect(listed.map((c) => c.id)).toEqual([commentId]);
  });
});
