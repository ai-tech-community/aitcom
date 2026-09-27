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

describe.skipIf(!RUN_DB)("classroom lesson files [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
    hostedFileBlockNode: typeof import("@/lib/classroom/lesson-body").hostedFileBlockNode;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    authorId: string;
    memberId: string;
    communityId: string;
    publicCourse: { id: number; slug: string };
    otherCourse: { id: number; slug: string };
  };
  let fx: Fixture;

  const body = (children: unknown[]) => ({
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: null,
      children,
    },
  });
  const files = (...ids: number[]) =>
    body(ids.map((id, i) => m.hostedFileBlockNode(id, `abcdefabcd${10 + i}`)));

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
      db,
      schema,
      createCaller,
      payload: await getPayloadClient(),
      hostedFileBlockNode: lessonBody.hostedFileBlockNode,
    };
  }, 120_000);

  async function createCourse(label: string) {
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `${label} ${fx.sfx}`,
        slug: `${label}-${fx.sfx}`,
        authorId: fx.authorId,
        authorName: "Author",
        status: "published",
        communityId: fx.communityId,
        isPublic: true,
        enrollmentCount: 0,
      },
    });
    return { id: course.id, slug: course.slug };
  }

  async function createMaterial(
    courseId: number,
    over: {
      visibility?: "members" | "preview";
      status?: "uploading" | "ready" | "failed";
      title?: string;
      bytes?: number;
      failureReason?: string;
    } = {},
  ) {
    const uploadId = crypto.randomUUID();
    return m.payload.create({
      collection: "hosted-materials",
      data: {
        communityId: fx.communityId,
        course: courseId,
        uploaderId: fx.authorId,
        kind: "file",
        status: over.status ?? "ready",
        title: over.title ?? "Handout",
        visibility: over.visibility ?? "members",
        fileName: "Handout.pdf",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: over.bytes ?? 1000,
        storageKey: `private/classroom/${fx.communityId}/${courseId}/${uploadId}.pdf`,
        uploadId,
        ...(over.failureReason ? { failureReason: over.failureReason } : {}),
      },
    });
  }

  beforeEach(async () => {
    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const authorId = `lf-author-${sfx}`;
    const memberId = `lf-member-${sfx}`;
    await m.db.insert(m.schema.user).values(
      [authorId, memberId].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Lesson files ${sfx}`,
        slug: `lesson-files-${sfx}`,
        createdBy: authorId,
      })
      .returning();
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: community!.id, userId: authorId, role: "admin" },
      { communityId: community!.id, userId: memberId, role: "member" },
    ]);
    fx = {
      sfx,
      authorId,
      memberId,
      communityId: community!.id,
      publicCourse: { id: 0, slug: "" },
      otherCourse: { id: 0, slug: "" },
    };
    fx.publicCourse = await createCourse("public");
    fx.otherCourse = await createCourse("other");
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    const courseIds = [fx.publicCourse.id, fx.otherCourse.id];
    await m.payload.delete({
      collection: "lessons",
      where: { course: { in: courseIds } },
    });
    await m.payload.delete({
      collection: "hosted-materials",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.payload.delete({
      collection: "courses",
      where: { id: { in: courseIds } },
    });
    await m.db
      .delete(m.schema.communityMemberships)
      .where(eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(eq(m.schema.communities.id, fx.communityId));
    await m.db
      .delete(m.schema.user)
      .where(inArray(m.schema.user.id, [fx.authorId, fx.memberId]));
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  it("saves a lesson whose files belong to its own course, and refuses another course's file", async () => {
    const author = callerAs(fx.authorId).classrooms;
    const own = await createMaterial(fx.publicCourse.id);
    const other = await createMaterial(fx.otherCourse.id, {
      visibility: "members",
    });

    await expect(
      author.addLesson({
        courseId: fx.publicCourse.id,
        title: "Ok",
        body: files(own.id),
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) });
    await expect(
      author.addLesson({
        courseId: fx.publicCourse.id,
        title: "Bad",
        body: files(other.id),
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "INVALID_MATERIAL",
    });

    const { id } = await author.addLesson({
      courseId: fx.publicCourse.id,
      title: "Edit me",
    });
    await expect(
      author.updateLesson({ lessonId: id, body: files(own.id, other.id) }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "INVALID_MATERIAL",
    });
  });

  it("still saves a lesson that uses a file the author has since deleted", async () => {
    const gone = await createMaterial(fx.publicCourse.id);
    await m.payload.delete({ collection: "hosted-materials", id: gone.id });
    await expect(
      callerAs(fx.authorId).classrooms.addLesson({
        courseId: fx.publicCourse.id,
        title: "Still fine",
        body: files(gone.id),
      }),
    ).resolves.toMatchObject({ id: expect.any(Number) });
  });

  it("refuses a file block without a usable id", async () => {
    const bad = body([
      {
        type: "block",
        version: 2,
        format: "",
        fields: {
          id: "abcabcabcabc",
          blockName: "",
          blockType: "HostedFile",
          materialId: "12",
        },
      },
    ]);
    await expect(
      callerAs(fx.authorId).classrooms.addLesson({
        courseId: fx.publicCourse.id,
        title: "Bad id",
        body: bad,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "INVALID_MATERIAL",
    });
  });

  it("classrooms.get: visitors get free-preview files and a join note for members files; the manifest never reaches another course", async () => {
    const membersFile = await createMaterial(fx.publicCourse.id, {
      visibility: "members",
      title: "Workbook",
      bytes: 4096,
    });
    const previewFile = await createMaterial(fx.publicCourse.id, {
      visibility: "preview",
      title: "Sample",
    });
    const uploading = await createMaterial(fx.publicCourse.id, {
      visibility: "preview",
      status: "uploading",
    });
    // Planted directly (bypassing the save check) to prove the read side
    // only ever looks inside the lesson's own course.
    const foreign = await createMaterial(fx.otherCourse.id, {
      visibility: "preview",
    });
    await m.payload.create({
      collection: "lessons",
      data: {
        course: fx.publicCourse.id,
        title: "Lesson one",
        order: 0,
        body: files(
          membersFile.id,
          previewFile.id,
          uploading.id,
          foreign.id,
          999_999_999,
        ) as never,
      },
    });

    const visitor = await callerAs(null).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(visitor.materials[membersFile.id]).toEqual({
      access: "join",
      kind: "file",
      title: "Workbook",
      extension: "pdf",
      contentType: "application/pdf",
      bytes: 4096,
      status: "ready",
      visibility: "members",
    });
    expect(visitor.materials[previewFile.id]).toMatchObject({
      access: "download",
      title: "Sample",
    });
    expect(visitor.materials[uploading.id]).toMatchObject({
      access: "processing",
    });
    expect(visitor.materials[foreign.id]).toEqual({ access: "removed" });
    expect(visitor.materials[999_999_999]).toEqual({ access: "removed" });
    expect(JSON.stringify(visitor.materials)).not.toContain(
      "private/classroom",
    );
    expect(visitor.viewerCanUpload).toBe(false);

    const member = await callerAs(fx.memberId).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(member.materials[membersFile.id]).toMatchObject({
      access: "download",
    });
    expect(member.viewerCanUpload).toBe(false);

    const author = await callerAs(fx.authorId).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(author.viewerCanUpload).toBe(true);
  });

  it("classrooms.get: a file deleted or cancelled while its upload was live reads as removed; a failed upload reads as failed", async () => {
    const deleted = await createMaterial(fx.publicCourse.id, {
      status: "failed",
      failureReason: "deleted",
    });
    const cancelled = await createMaterial(fx.publicCourse.id, {
      status: "failed",
      failureReason: "cancelled",
    });
    const broken = await createMaterial(fx.publicCourse.id, {
      status: "failed",
      failureReason: "UPLOAD_MISMATCH",
    });
    await m.payload.create({
      collection: "lessons",
      data: {
        course: fx.publicCourse.id,
        title: "Lesson one",
        order: 0,
        body: files(deleted.id, cancelled.id, broken.id) as never,
      },
    });

    const member = await callerAs(fx.memberId).classrooms.get({
      slug: fx.publicCourse.slug,
    });
    expect(member.materials[deleted.id]).toEqual({ access: "removed" });
    expect(member.materials[cancelled.id]).toEqual({ access: "removed" });
    expect(member.materials[broken.id]).toMatchObject({ access: "failed" });
  });
});
