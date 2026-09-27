// @vitest-environment node
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// S3 is never reached: the router's storage getter hands out this fake.
const storage = vi.hoisted(() => ({
  presignUpload: vi.fn(),
  inspect: vi.fn(),
  signedGetUrl: vi.fn(),
  publicUrl: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/server/media/object-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/object-storage")>()),
  getObjectStorage: () => storage,
}));

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

const GB5 = 5 * 1024 ** 3;

describe.skipIf(!RUN_DB)("classroom hosted files [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    createCaller: typeof import("@/server/api/root").createCaller;
    payload: Awaited<
      ReturnType<typeof import("@/server/payload").getPayloadClient>
    >;
  };
  let m: Mods;

  type Fixture = {
    sfx: string;
    ownerId: string;
    authorId: string;
    memberId: string;
    memberAuthorId: string;
    outsiderId: string;
    communityId: string;
    communitySlug: string;
    membersOnlyId: number;
    publicId: number;
    memberCourseId: number;
  };
  let fx: Fixture;

  beforeAll(async () => {
    const [{ db }, schema, { createCaller }, { getPayloadClient }] =
      await Promise.all([
        import("@/server/db"),
        import("@/server/db/schema"),
        import("@/server/api/root"),
        import("@/server/payload"),
      ]);
    m = { db, schema, createCaller, payload: await getPayloadClient() };
  }, 120_000);

  async function createCourse(
    label: string,
    authorId: string,
    isPublic: boolean,
  ): Promise<number> {
    const course = await m.payload.create({
      collection: "courses",
      data: {
        title: `${label} ${fx.sfx}`,
        slug: `${label}-${fx.sfx}`,
        authorId,
        authorName: "Author",
        status: "published",
        communityId: fx.communityId,
        isPublic,
        enrollmentCount: 0,
      },
    });
    return course.id;
  }

  async function createMaterial(
    courseId: number,
    over: {
      visibility?: "members" | "preview";
      status?: "uploading" | "ready" | "failed";
      bytes?: number;
      title?: string;
      extension?: string;
      contentType?: string;
      failureReason?: string;
      createdAt?: string;
    } = {},
  ) {
    const uploadId = crypto.randomUUID();
    const extension = over.extension ?? "pdf";
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
        fileName: `Handout.${extension}`,
        extension,
        contentType: over.contentType ?? "application/pdf",
        bytes: over.bytes ?? 1000,
        storageKey: `private/classroom/${fx.communityId}/${courseId}/${uploadId}.${extension}`,
        uploadId,
        ...(over.failureReason ? { failureReason: over.failureReason } : {}),
        ...(over.createdAt ? { createdAt: over.createdAt } : {}),
      },
    });
  }

  const DAY_AGO = () => new Date(Date.now() - 24 * 3600_000).toISOString();

  beforeEach(async () => {
    vi.clearAllMocks();
    storage.presignUpload.mockImplementation(
      async ({ key }: { key: string }) => ({
        url: "https://s3.test/",
        fields: { key },
      }),
    );
    storage.signedGetUrl.mockResolvedValue("https://signed.test/file");
    storage.remove.mockResolvedValue(undefined);

    const sfx = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ids = {
      ownerId: `hf-owner-${sfx}`,
      authorId: `hf-author-${sfx}`,
      memberId: `hf-member-${sfx}`,
      memberAuthorId: `hf-member-author-${sfx}`,
      outsiderId: `hf-outsider-${sfx}`,
    };
    await m.db.insert(m.schema.user).values(
      Object.values(ids).map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
      })),
    );
    const [community] = await m.db
      .insert(m.schema.communities)
      .values({
        name: `Files ${sfx}`,
        slug: `files-${sfx}`,
        createdBy: ids.ownerId,
      })
      .returning();
    await m.db.insert(m.schema.communityMemberships).values([
      { communityId: community!.id, userId: ids.ownerId, role: "owner" },
      { communityId: community!.id, userId: ids.authorId, role: "admin" },
      { communityId: community!.id, userId: ids.memberId, role: "member" },
      {
        communityId: community!.id,
        userId: ids.memberAuthorId,
        role: "member",
      },
    ]);
    fx = {
      sfx,
      ...ids,
      communityId: community!.id,
      communitySlug: community!.slug,
      membersOnlyId: 0,
      publicId: 0,
      memberCourseId: 0,
    };
    fx.membersOnlyId = await createCourse("members-only", ids.authorId, false);
    fx.publicId = await createCourse("public", ids.authorId, true);
    fx.memberCourseId = await createCourse(
      "member-course",
      ids.memberAuthorId,
      false,
    );
  });

  afterEach(async () => {
    const { eq, inArray } = await import("drizzle-orm");
    const courseIds = [fx.membersOnlyId, fx.publicId, fx.memberCourseId];
    await m.payload.delete({
      collection: "hosted-materials",
      where: { communityId: { equals: fx.communityId } },
    });
    await m.payload.delete({
      collection: "courses",
      where: { id: { in: courseIds } },
    });
    const userIds = [
      fx.ownerId,
      fx.authorId,
      fx.memberId,
      fx.memberAuthorId,
      fx.outsiderId,
    ];
    await m.db
      .delete(m.schema.activityEvents)
      .where(inArray(m.schema.activityEvents.actorId, userIds));
    await m.db
      .delete(m.schema.communityMemberships)
      .where(eq(m.schema.communityMemberships.communityId, fx.communityId));
    await m.db
      .delete(m.schema.communities)
      .where(eq(m.schema.communities.id, fx.communityId));
    for (const id of userIds) {
      await m.db.delete(m.schema.user).where(eq(m.schema.user.id, id));
    }
  });

  function callerAs(userId: string | null) {
    return m.createCaller({
      db: m.db,
      headers: new Headers(),
      session: userId ? ({ user: { id: userId }, session: {} } as never) : null,
    });
  }

  it("the author starts an upload: a record, then a grant pinned to its key, type and size", async () => {
    const grant = await callerAs(
      fx.authorId,
    ).classroomMaterials.startFileUpload({
      courseId: fx.membersOnlyId,
      fileName: "Week 1 slides.PDF",
      bytes: 2048,
    });
    expect(grant.contentType).toBe("application/pdf");
    expect(storage.presignUpload).toHaveBeenCalledTimes(1);
    const call = storage.presignUpload.mock.calls[0]![0] as {
      key: string;
      contentType: string;
      maxBytes: number;
    };
    expect(call.key).toMatch(
      new RegExp(
        `^private/classroom/${fx.communityId}/${fx.membersOnlyId}/[0-9a-f-]{36}\\.pdf$`,
      ),
    );
    expect(call).toMatchObject({
      contentType: "application/pdf",
      maxBytes: 2048,
    });
    const saved = await m.payload.findByID({
      collection: "hosted-materials",
      id: grant.materialId,
      depth: 0,
    });
    expect(saved).toMatchObject({
      status: "uploading",
      title: "Week 1 slides",
      visibility: "members",
      extension: "pdf",
      bytes: 2048,
      uploaderId: fx.authorId,
      communityId: fx.communityId,
      course: fx.membersOnlyId,
      storageKey: call.key,
    });
  });

  it("finishing checks the stored object and marks the file ready", async () => {
    const author = callerAs(fx.authorId);
    const grant = await author.classroomMaterials.startFileUpload({
      courseId: fx.membersOnlyId,
      fileName: "Workbook.docx",
      bytes: 2048,
    });
    storage.inspect.mockResolvedValue({
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      bytes: 2000,
    });
    await expect(
      author.classroomMaterials.finishFileUpload({
        materialId: grant.materialId,
      }),
    ).resolves.toMatchObject({
      id: grant.materialId,
      status: "ready",
      // The declared size stays: the grant could still fill it.
      bytes: 2048,
    });
    const key = (storage.presignUpload.mock.calls[0]![0] as { key: string })
      .key;
    expect(storage.inspect).toHaveBeenCalledWith(key);
  });

  it("owners and admins only by default; after the owner opens uploads, a member author may upload", async () => {
    const memberAuthor = callerAs(fx.memberAuthorId);
    const start = () =>
      memberAuthor.classroomMaterials.startFileUpload({
        courseId: fx.memberCourseId,
        fileName: "a.pdf",
        bytes: 10,
      });
    await expect(start()).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "UPLOADS_NOT_ALLOWED",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();

    await callerAs(fx.ownerId).communities.updateSettings({
      slug: fx.communitySlug,
      classroomUploadPolicy: "all_members",
    });
    await expect(start()).resolves.toMatchObject({
      contentType: "application/pdf",
    });
  });

  it("nobody uploads into a course they did not write", async () => {
    await expect(
      callerAs(fx.memberId).classroomMaterials.startFileUpload({
        courseId: fx.membersOnlyId,
        fileName: "a.pdf",
        bytes: 10,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an upload that would go past the storage allowance", async () => {
    await createMaterial(fx.membersOnlyId, { bytes: GB5 - 100 });
    const start = (bytes: number) =>
      callerAs(fx.authorId).classroomMaterials.startFileUpload({
        courseId: fx.membersOnlyId,
        fileName: "a.pdf",
        bytes,
      });
    await expect(start(101)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "STORAGE_FULL",
    });
    expect(storage.presignUpload).not.toHaveBeenCalled();
    await expect(start(100)).resolves.toMatchObject({
      contentType: "application/pdf",
    });
  });

  it("a cancelled transfer is discarded: kept as failed and counted while its grant lives, stored part removed", async () => {
    const author = callerAs(fx.authorId);
    const grant = await author.classroomMaterials.startFileUpload({
      courseId: fx.membersOnlyId,
      fileName: "Deck.pptx",
      bytes: 4096,
    });
    const usage = () =>
      callerAs(fx.ownerId).classroomMaterials.usage({ slug: fx.communitySlug });
    await expect(usage()).resolves.toMatchObject({ fileBytesStored: 4096 });

    await expect(
      callerAs(fx.memberId).classroomMaterials.discardUpload({
        materialId: grant.materialId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "UPLOAD_EXPIRED" });

    await expect(
      author.classroomMaterials.discardUpload({ materialId: grant.materialId }),
    ).resolves.toMatchObject({
      id: grant.materialId,
      status: "failed",
      failureReason: "cancelled",
    });
    const key = (storage.presignUpload.mock.calls[0]![0] as { key: string })
      .key;
    expect(storage.remove).toHaveBeenCalledWith([key]);
    // The grant is still live, so its bytes stay reserved until it expires.
    await expect(usage()).resolves.toMatchObject({ fileBytesStored: 4096 });
    await expect(
      m.payload.findByID({
        collection: "hosted-materials",
        id: grant.materialId,
        depth: 0,
      }),
    ).resolves.toMatchObject({ status: "failed", failureReason: "cancelled" });
    await expect(
      author.classroomMaterials.finishFileUpload({
        materialId: grant.materialId,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "UPLOAD_FAILED" });
  });

  it("the daily upload limit counts every upload started in the last day, failed ones too", async () => {
    for (let i = 0; i < 29; i++) {
      await createMaterial(fx.membersOnlyId, {
        bytes: 10,
        status: i % 2 === 0 ? "failed" : "ready",
      });
    }
    const start = () =>
      callerAs(fx.authorId).classroomMaterials.startFileUpload({
        courseId: fx.membersOnlyId,
        fileName: "a.pdf",
        bytes: 10,
      });
    await expect(start()).resolves.toMatchObject({
      contentType: "application/pdf",
    });
    await expect(start()).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "UPLOAD_LIMIT",
    });
  });

  it("usage counts uploading and ready files, and failed ones only while their grant may live, for owners and admins only", async () => {
    await createMaterial(fx.membersOnlyId, { bytes: 1000 });
    await createMaterial(fx.publicId, { bytes: 500, status: "uploading" });
    await createMaterial(fx.membersOnlyId, { bytes: 200, status: "failed" });
    const old = await createMaterial(fx.membersOnlyId, {
      bytes: 9999,
      status: "failed",
      createdAt: DAY_AGO(),
    });
    // Guard the fixture: Payload kept the back-dated creation time.
    expect(new Date(old.createdAt).getTime()).toBeLessThan(
      Date.now() - 3600_000,
    );
    for (const id of [fx.ownerId, fx.authorId]) {
      await expect(
        callerAs(id).classroomMaterials.usage({ slug: fx.communitySlug }),
      ).resolves.toEqual({ fileBytesStored: 1700, fileBytesAllowed: GB5 });
    }
    await expect(
      callerAs(fx.memberId).classroomMaterials.usage({
        slug: fx.communitySlug,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("download links: members of a members-only course; visitors of a public course only for free-preview files", async () => {
    const file = await createMaterial(fx.membersOnlyId, { title: "Handout" });
    await expect(
      callerAs(fx.memberId).classroomMaterials.fileLink({
        materialId: file.id,
        disposition: "attachment",
      }),
    ).resolves.toEqual({ url: "https://signed.test/file" });
    expect(storage.signedGetUrl).toHaveBeenLastCalledWith(file.storageKey, {
      downloadName: "Handout.pdf",
      disposition: "attachment",
      contentType: "application/pdf",
    });
    for (const viewer of [fx.outsiderId, null]) {
      await expect(
        callerAs(viewer).classroomMaterials.fileLink({
          materialId: file.id,
          disposition: "attachment",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }

    const membersFile = await createMaterial(fx.publicId, {
      visibility: "members",
    });
    const previewFile = await createMaterial(fx.publicId, {
      visibility: "preview",
    });
    await expect(
      callerAs(null).classroomMaterials.fileLink({
        materialId: membersFile.id,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      callerAs(null).classroomMaterials.fileLink({
        materialId: previewFile.id,
        disposition: "inline",
      }),
    ).resolves.toEqual({ url: "https://signed.test/file" });
    expect(storage.signedGetUrl).toHaveBeenLastCalledWith(
      previewFile.storageKey,
      {
        downloadName: "Handout.pdf",
        disposition: "inline",
        contentType: "application/pdf",
      },
    );
  });

  it("never links a file still uploading, and never shows a ZIP inline", async () => {
    const member = callerAs(fx.memberId);
    const uploading = await createMaterial(fx.membersOnlyId, {
      status: "uploading",
    });
    await expect(
      member.classroomMaterials.fileLink({
        materialId: uploading.id,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const zip = await createMaterial(fx.membersOnlyId, {
      extension: "zip",
      contentType: "application/zip",
    });
    await expect(
      member.classroomMaterials.fileLink({
        materialId: zip.id,
        disposition: "inline",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("the author lists, renames, shares and deletes course files; nobody else may", async () => {
    const file = await createMaterial(fx.membersOnlyId, { title: "Old name" });
    await expect(
      callerAs(fx.memberId).classroomMaterials.listCourseMaterials({
        courseId: fx.membersOnlyId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const author = callerAs(fx.authorId);
    await author.classroomMaterials.updateMaterial({
      materialId: file.id,
      title: "  New name ",
      visibility: "preview",
    });
    const list = await author.classroomMaterials.listCourseMaterials({
      courseId: fx.membersOnlyId,
    });
    expect(list).toEqual([
      expect.objectContaining({
        id: file.id,
        title: "New name",
        visibility: "preview",
        status: "ready",
      }),
    ]);
    expect(list[0]).not.toHaveProperty("storageKey");

    await author.classroomMaterials.deleteMaterial({ materialId: file.id });
    expect(storage.remove).toHaveBeenCalledWith([file.storageKey]);
    await expect(
      author.classroomMaterials.listCourseMaterials({
        courseId: fx.membersOnlyId,
      }),
    ).resolves.toEqual([]);
  });

  it("deleting a file whose grant may be live keeps a hidden failed record; an older file is deleted outright", async () => {
    const author = callerAs(fx.authorId);
    const fresh = await createMaterial(fx.membersOnlyId, { title: "Fresh" });
    const settled = await createMaterial(fx.membersOnlyId, {
      title: "Settled",
      createdAt: DAY_AGO(),
    });
    const mismatch = await createMaterial(fx.membersOnlyId, {
      title: "Bad upload",
      status: "failed",
      failureReason: "UPLOAD_MISMATCH",
    });

    await author.classroomMaterials.deleteMaterial({ materialId: fresh.id });
    await expect(
      m.payload.findByID({
        collection: "hosted-materials",
        id: fresh.id,
        depth: 0,
      }),
    ).resolves.toMatchObject({ status: "failed", failureReason: "deleted" });

    await author.classroomMaterials.deleteMaterial({ materialId: settled.id });
    await expect(
      m.payload.findByID({
        collection: "hosted-materials",
        id: settled.id,
        depth: 0,
        disableErrors: true,
      }),
    ).resolves.toBeNull();
    expect(storage.remove).toHaveBeenCalledWith([fresh.storageKey]);
    expect(storage.remove).toHaveBeenCalledWith([settled.storageKey]);

    // The author still sees an upload that failed its check, not the deleted one.
    await expect(
      author.classroomMaterials.listCourseMaterials({
        courseId: fx.membersOnlyId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: mismatch.id, status: "failed" }),
    ]);
  });
});
