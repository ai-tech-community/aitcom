// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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

describe.skipIf(!RUN_DB)("classroom lesson bodies [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<ReturnType<typeof import("@/server/payload").getPayloadClient>>;
    embedBlockNode: typeof import("@/lib/classroom/lesson-body").embedBlockNode;
  };
  let m: Mods;
  let sfx: string;
  let authorId: string;
  let communityId: string;
  let courseId: number;

  const body = (url: string) => ({
    root: {
      type: "root", format: "", indent: 0, version: 1, direction: null,
      children: [m.embedBlockNode(url, "abcdefabcdef")],
    },
  });

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }, lessonBody] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
        import("@/lib/classroom/lesson-body"),
      ]);
    m = {
      db, schema, createCaller,
      payload: await getPayloadClient(),
      embedBlockNode: lessonBody.embedBlockNode,
    };
  }, 120_000);

  beforeEach(async () => {
    sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    authorId = `lb-author-${sfx}`;
    await m.db.insert(m.schema.user).values({ id: authorId, email: `${authorId}@example.test`, name: "Author" });
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({ name: `Lessons ${sfx}`, slug: `lessons-${sfx}`, createdBy: authorId })
      .returning();
    communityId = community!.id;
    await m.db.insert(m.schema.communityMemberships).values({ communityId, userId: authorId, role: "member" });
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `Course ${sfx}`, slug: `course-${sfx}`, authorId, authorName: "Author",
        status: "published", communityId, isPublic: false, enrollmentCount: 0,
      },
    });
    courseId = course.id;
  });

  afterEach(async () => {
    const { eq } = await import("drizzle-orm");
    await m.payload.delete({ collection: "lessons", where: { course: { equals: courseId } } });
    await m.payload.delete({ collection: "courses", id: courseId });
    await m.db.delete(m.schema.communityMemberships).where(eq(m.schema.communityMemberships.communityId, communityId));
    await m.db.delete(m.schema.communities).where(eq(m.schema.communities.id, communityId));
    await m.db.delete(m.schema.user).where(eq(m.schema.user.id, authorId));
  });

  const caller = () =>
    m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: { user: { id: authorId }, session: {} } as never,
    });

  it("stores a lesson whose Embed blocks resolve", async () => {
    const { id } = await caller().classrooms.addLesson({
      courseId, title: "Slides", body: body("https://youtu.be/dQw4w9WgXcQ"),
    });
    const saved = await m.payload.findByID({ collection: "lessons", id, depth: 0 });
    expect(JSON.stringify(saved.body)).toContain('"blockType":"Embed"');
  });

  it("refuses an Embed block the registry cannot embed, on add and on update", async () => {
    await expect(
      caller().classrooms.addLesson({ courseId, title: "Bad", body: body("https://evil.test/x") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_EMBED" });

    const { id } = await caller().classrooms.addLesson({ courseId, title: "Ok" });
    await expect(
      caller().classrooms.updateLesson({ lessonId: id, body: body("javascript:alert(1)") }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "INVALID_EMBED" });
  });
});
