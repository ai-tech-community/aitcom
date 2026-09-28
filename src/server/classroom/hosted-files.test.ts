import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_TITLE_MAX,
  MAX_FILE_BYTES,
} from "@/lib/classroom/material-rules";
import { FINISH_WINDOW_HOURS, UPLOAD_GRANT_SECONDS } from "@/lib/video-rules";

import {
  deleteMaterial,
  fileUploadsEnabled,
  discardUpload,
  fileLink,
  finishFileUpload,
  listCourseMaterials,
  mayUploadMaterials,
  startFileUpload,
  updateMaterial,
} from "./hosted-files";

const testEnv = vi.hoisted(() => ({
  CLASSROOM_FILE_UPLOADS: "on" as "on" | "off" | undefined,
}));
vi.mock("@/env", () => ({ env: testEnv }));
afterEach(() => {
  testEnv.CLASSROOM_FILE_UPLOADS = "on";
});

const UPLOAD = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const NOW = new Date("2026-09-28T12:00:00.000Z");
const KEY = `private/classroom/c1/12/${UPLOAD}.pdf`;
const GB5 = 5 * 1024 ** 3;
const ago = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();
/** The conditional write finish and discard use: only while still uploading. */
const WHILE_UPLOADING = {
  and: [{ id: { equals: 7 } }, { status: { equals: "uploading" } }],
};
const COURSE = {
  id: 12,
  authorId: "u1",
  communityId: "c1",
  status: "published",
  isPublic: false,
};

function material(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    communityId: "c1",
    course: 12,
    uploaderId: "u1",
    kind: "file",
    status: "uploading",
    failureReason: null,
    title: "Week 1 slides",
    visibility: "members",
    fileName: "Week 1 slides.pdf",
    extension: "pdf",
    contentType: "application/pdf",
    bytes: 2048,
    storageKey: KEY,
    uploadId: UPLOAD,
    createdAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
}

type Over = {
  course?: unknown;
  material?: unknown;
  community?: boolean;
  policy?: "all_members" | "admins_only";
  role?: string | null;
  recent?: number;
  docs?: unknown[];
  stored?: unknown;
  removeFails?: boolean;
  /** A concurrent request changed the record first: the conditional write
   * matches nothing, and a re-read finds the record in this state. */
  lostRace?: unknown;
};

function fakes(over: Over = {}) {
  const found: Record<string, unknown> = {
    courses: "course" in over ? over.course : COURSE,
    "hosted-materials": "material" in over ? over.material : material(),
  };
  let materialReads = 0;
  const payload = {
    findByID: vi.fn(({ collection }: { collection: string }) => {
      if (collection === "hosted-materials" && materialReads++ > 0) {
        if ("lostRace" in over) return Promise.resolve(over.lostRace ?? null);
      }
      return Promise.resolve(found[collection] ?? null);
    }),
    count: vi.fn().mockResolvedValue({ totalDocs: over.recent ?? 0 }),
    find: vi.fn().mockResolvedValue({ docs: over.docs ?? [] }),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 7,
        failureReason: null,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        ...data,
      }),
    ),
    update: vi.fn(
      ({
        id,
        where,
        data,
      }: {
        id?: number;
        where?: unknown;
        data: Record<string, unknown>;
      }) => {
        const updated = {
          ...(found["hosted-materials"] as object),
          id: id ?? 7,
          ...data,
        };
        if (where === undefined) return Promise.resolve(updated);
        return Promise.resolve({
          docs: "lostRace" in over ? [] : [updated],
          errors: [],
        });
      },
    ),
    delete: vi.fn().mockResolvedValue({}),
  };
  const db = {
    query: {
      communities: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            over.community === false
              ? undefined
              : { classroomUploadPolicy: over.policy ?? "admins_only" },
          ),
      },
      communityMemberships: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            over.role === null
              ? undefined
              : { role: over.role ?? "admin", status: "active" },
          ),
      },
    },
  };
  const storage = {
    presignUpload: vi.fn(({ key }: { key: string }) =>
      Promise.resolve({ url: "https://s3.test/", fields: { key } }),
    ),
    inspect: vi.fn().mockResolvedValue("stored" in over ? over.stored : null),
    signedGetUrl: vi.fn().mockResolvedValue("https://signed.test/f"),
    publicUrl: vi.fn(),
    remove: over.removeFails
      ? vi.fn().mockRejectedValue(new Error("s3 down"))
      : vi.fn().mockResolvedValue(undefined),
  };
  const getStorage = vi.fn(() => storage);
  const log = vi.fn();
  return {
    payload,
    db,
    storage,
    getStorage,
    log,
    deps: {
      payload: payload as never,
      db: db as never,
      storage: getStorage as never,
      now: () => NOW,
      newUploadId: () => UPLOAD,
      log,
    },
  };
}

const START = {
  userId: "u1",
  courseId: 12,
  fileName: "Week 1 slides.pdf",
  bytes: 2048,
};

describe("startFileUpload", () => {
  it("grants exactly the declared size, then records the upload, for the type the extension implies", async () => {
    const { deps, payload, storage } = fakes();
    await expect(startFileUpload(deps, START)).resolves.toEqual({
      materialId: 7,
      upload: { url: "https://s3.test/", fields: { key: KEY } },
      contentType: "application/pdf",
    });
    expect(payload.count).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { uploaderId: { equals: "u1" } },
          { createdAt: { greater_than: "2026-09-27T12:00:00.000Z" } },
        ],
      },
    });
    expect(payload.create).toHaveBeenCalledWith({
      collection: "hosted-materials",
      data: {
        communityId: "c1",
        course: 12,
        uploaderId: "u1",
        kind: "file",
        status: "uploading",
        title: "Week 1 slides",
        visibility: "members",
        fileName: "Week 1 slides.pdf",
        extension: "pdf",
        contentType: "application/pdf",
        bytes: 2048,
        storageKey: KEY,
        uploadId: UPLOAD,
      },
    });
    expect(storage.presignUpload).toHaveBeenCalledWith({
      key: KEY,
      contentType: "application/pdf",
      maxBytes: 2048,
    });
  });

  it.each([
    [
      "an emoji at the length limit",
      `${"a".repeat(MATERIAL_FILE_NAME_MAX - 1)}\u{1F600}.pdf`,
      "a".repeat(MATERIAL_FILE_NAME_MAX - 1),
      "a".repeat(MATERIAL_TITLE_MAX),
    ],
    ["a lone surrogate", "Deck \uD83D.pdf", "Deck \uFFFD.pdf", "Deck \uFFFD"],
  ])(
    "stores a well-formed file name and title for %s",
    async (_label, fileName, storedName, title) => {
      const { deps, payload } = fakes();
      await startFileUpload(deps, { ...START, fileName });
      expect(payload.create).toHaveBeenCalledWith({
        collection: "hosted-materials",
        data: expect.objectContaining({ fileName: storedName, title }),
      });
    },
  );

  it("lets a member upload when the community allows all members", async () => {
    const { deps } = fakes({ policy: "all_members", role: "member" });
    await expect(startFileUpload(deps, START)).resolves.toMatchObject({
      materialId: 7,
    });
  });

  it("accepts a file of exactly 200 MB", async () => {
    const { deps } = fakes();
    await expect(
      startFileUpload(deps, { ...START, bytes: MAX_FILE_BYTES }),
    ).resolves.toMatchObject({ materialId: 7 });
  });

  it("accepts an upload that fills the allowance exactly", async () => {
    const { deps } = fakes({ docs: [{ bytes: GB5 - 2048 }] });
    await expect(startFileUpload(deps, START)).resolves.toMatchObject({
      materialId: 7,
    });
  });

  const refusals: Array<
    [string, Over, Partial<typeof START>, string, string | undefined]
  > = [
    ["someone else's course", {}, { userId: "u2" }, "FORBIDDEN", undefined],
    ["a missing course", { course: null }, {}, "NOT_FOUND", undefined],
    [
      "a member under owners-and-admins",
      { role: "member" },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "a moderator under owners-and-admins",
      { role: "moderator" },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "an author who left the community",
      { policy: "all_members", role: null },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "a deleted community",
      { community: false },
      {},
      "FORBIDDEN",
      "UPLOADS_NOT_ALLOWED",
    ],
    [
      "a program file",
      {},
      { fileName: "setup.exe" },
      "BAD_REQUEST",
      "FILE_TYPE_NOT_ALLOWED",
    ],
    [
      "a disguised program",
      {},
      { fileName: "notes.pdf.exe" },
      "BAD_REQUEST",
      "FILE_TYPE_NOT_ALLOWED",
    ],
    [
      "a file without extension",
      {},
      { fileName: "README" },
      "BAD_REQUEST",
      "FILE_TYPE_NOT_ALLOWED",
    ],
    ["an empty file", {}, { bytes: 0 }, "BAD_REQUEST", "FILE_EMPTY"],
    [
      "a file over 200 MB",
      {},
      { bytes: MAX_FILE_BYTES + 1 },
      "BAD_REQUEST",
      "FILE_TOO_LARGE",
    ],
    [
      "the 31st upload today",
      { recent: 30 },
      {},
      "TOO_MANY_REQUESTS",
      "UPLOAD_LIMIT",
    ],
    [
      "an upload past the allowance",
      { docs: [{ bytes: GB5 - 2047 }] },
      {},
      "FORBIDDEN",
      "STORAGE_FULL",
    ],
  ];

  it.each([
    ["switched off", "off"] as const,
    ["not switched on", undefined] as const,
  ])(
    "refuses every upload while site uploads are %s, before anything is created or granted",
    async (_label, value) => {
      testEnv.CLASSROOM_FILE_UPLOADS = value;
      const { deps, payload, storage } = fakes();
      await expect(startFileUpload(deps, START)).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "UPLOADS_NOT_ALLOWED",
      });
      expect(payload.create).not.toHaveBeenCalled();
      expect(storage.presignUpload).not.toHaveBeenCalled();
    },
  );

  it("leaves no record when the upload grant cannot be made", async () => {
    const { deps, payload, storage } = fakes();
    storage.presignUpload.mockRejectedValueOnce(new Error("s3 down"));
    await expect(startFileUpload(deps, START)).rejects.toThrow("s3 down");
    expect(payload.create).not.toHaveBeenCalled();
  });

  it.each(refusals)(
    "refuses %s and leaves nothing behind",
    async (_label, over, input, code, message) => {
      const { deps, payload, storage } = fakes(over);
      const refusal = startFileUpload(deps, { ...START, ...input });
      await expect(refusal).rejects.toMatchObject(
        message ? { code, message } : { code },
      );
      expect(payload.create).not.toHaveBeenCalled();
      expect(storage.presignUpload).not.toHaveBeenCalled();
    },
  );
});

describe("finishFileUpload", () => {
  it("marks the file ready, keeping the declared size that the allowance reserved", async () => {
    const { deps, payload, storage } = fakes({
      stored: { contentType: "application/pdf", bytes: 2000 },
    });
    const done = await finishFileUpload(deps, { userId: "u1", materialId: 7 });
    expect(storage.inspect).toHaveBeenCalledWith(KEY);
    expect(payload.update).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: WHILE_UPLOADING,
      data: { status: "ready" },
    });
    expect(done).toEqual({
      id: 7,
      title: "Week 1 slides",
      extension: "pdf",
      contentType: "application/pdf",
      bytes: 2048,
      status: "ready",
      visibility: "members",
      failureReason: null,
      createdAt: material().createdAt,
    });
  });

  it.each([
    ["missing", null],
    ["of the wrong type", { contentType: "text/html", bytes: 2000 }],
    ["empty", { contentType: "application/pdf", bytes: 0 }],
    ["bigger than declared", { contentType: "application/pdf", bytes: 2049 }],
  ])(
    "deletes an upload that is %s and marks it failed",
    async (_label, stored) => {
      const { deps, payload, storage } = fakes({ stored });
      await expect(
        finishFileUpload(deps, { userId: "u1", materialId: 7 }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "UPLOAD_FAILED",
      });
      expect(payload.update).toHaveBeenCalledWith({
        collection: "hosted-materials",
        where: WHILE_UPLOADING,
        data: { status: "failed", failureReason: "UPLOAD_MISMATCH" },
      });
      expect(storage.remove).toHaveBeenCalledWith([KEY]);
      expect(payload.update.mock.invocationCallOrder[0]!).toBeLessThan(
        storage.remove.mock.invocationCallOrder[0]!,
      );
    },
  );

  it("returns the file as a concurrent finish left it, when that finish won", async () => {
    const { deps } = fakes({
      stored: { contentType: "application/pdf", bytes: 2000 },
      lostRace: material({ status: "ready" }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready", bytes: 2048 });
  });

  it("answers UPLOAD_FAILED when a discard won the race", async () => {
    const { deps } = fakes({
      stored: { contentType: "application/pdf", bytes: 2000 },
      lostRace: material({ status: "failed", failureReason: "cancelled" }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "UPLOAD_FAILED" });
  });

  it("does not remove the object of a bad upload when another request changed the record first", async () => {
    const { deps, storage } = fakes({
      stored: null,
      lostRace: material({ status: "ready" }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ status: "ready" });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("answers UPLOAD_EXPIRED when the record vanished during the race", async () => {
    const { deps } = fakes({
      stored: { contentType: "application/pdf", bytes: 2000 },
      lostRace: null,
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "UPLOAD_EXPIRED" });
  });

  it("still marks a bad upload failed when deleting it fails, and logs that", async () => {
    const { deps, payload, log } = fakes({ stored: null, removeFails: true });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ message: "UPLOAD_FAILED" });
    expect(log).toHaveBeenCalledWith(
      "[classroomMaterials.finishFileUpload] removing a bad upload failed",
      expect.objectContaining({ materialId: 7, key: KEY }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "failed", failureReason: "UPLOAD_MISMATCH" },
      }),
    );
  });

  it("returns a ready file unchanged on a second finish", async () => {
    const { deps, payload, storage } = fakes({
      material: material({ status: "ready", bytes: 2000 }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready", bytes: 2000 });
    expect(storage.inspect).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("keeps a failed upload failed", async () => {
    const { deps, storage } = fakes({
      material: material({ status: "failed" }),
    });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "UPLOAD_FAILED" });
    expect(storage.inspect).not.toHaveBeenCalled();
  });

  it.each([
    ["someone else's upload", material({ uploaderId: "u2" })],
    ["an unknown upload", null],
    [
      "an upload past the finish window",
      material({
        createdAt: new Date(
          NOW.getTime() - FINISH_WINDOW_HOURS * 3600_000 - 60_000,
        ).toISOString(),
      }),
    ],
  ])("answers UPLOAD_EXPIRED for %s and touches nothing", async (_l, m) => {
    const { deps, payload, getStorage } = fakes({ material: m });
    await expect(
      finishFileUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "UPLOAD_EXPIRED" });
    expect(getStorage).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});

describe("discardUpload", () => {
  it("marks a cancelled upload failed, then removes any stored part", async () => {
    const { deps, payload, storage } = fakes();
    await expect(
      discardUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({
      id: 7,
      status: "failed",
      failureReason: "cancelled",
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: WHILE_UPLOADING,
      data: { status: "failed", failureReason: "cancelled" },
    });
    expect(storage.remove).toHaveBeenCalledWith([KEY]);
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.update.mock.invocationCallOrder[0]!).toBeLessThan(
      storage.remove.mock.invocationCallOrder[0]!,
    );
  });

  it("keeps the record failed when removing the stored part fails, and logs that", async () => {
    const { deps, payload, log } = fakes({ removeFails: true });
    await expect(
      discardUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ status: "failed" });
    expect(payload.update).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "[classroomMaterials.discardUpload] removing a discarded upload failed",
      expect.objectContaining({ materialId: 7, key: KEY }),
    );
  });

  it.each([
    ["ready", material({ status: "ready", bytes: 2000 })],
    [
      "failed",
      material({ status: "failed", failureReason: "UPLOAD_MISMATCH" }),
    ],
  ])("leaves a %s file as it is", async (status, m) => {
    const { deps, payload, getStorage } = fakes({ material: m });
    await expect(
      discardUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ id: 7, status });
    expect(payload.update).not.toHaveBeenCalled();
    expect(getStorage).not.toHaveBeenCalled();
  });

  it.each([
    ["someone else's upload", material({ uploaderId: "u2" })],
    ["an unknown upload", null],
    [
      "an upload past the finish window",
      material({
        createdAt: new Date(
          NOW.getTime() - FINISH_WINDOW_HOURS * 3600_000 - 60_000,
        ).toISOString(),
      }),
    ],
  ])("answers UPLOAD_EXPIRED for %s and touches nothing", async (_l, m) => {
    const { deps, payload, getStorage } = fakes({ material: m });
    await expect(
      discardUpload(deps, { userId: "u1", materialId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "UPLOAD_EXPIRED" });
    expect(getStorage).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});

describe("discardUpload races", () => {
  it("changes nothing when a finish won the race, and returns the ready file", async () => {
    const { deps, storage } = fakes({
      lostRace: material({ status: "ready" }),
    });
    await expect(
      discardUpload(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toMatchObject({ id: 7, status: "ready" });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("fileLink", () => {
  const ready = material({ status: "ready" });

  it("signs a download named after the title for a member", async () => {
    const { deps, storage } = fakes({ material: ready, role: "member" });
    await expect(
      fileLink(deps, {
        viewerId: "u9",
        materialId: 7,
        disposition: "attachment",
      }),
    ).resolves.toEqual({ url: "https://signed.test/f" });
    expect(storage.signedGetUrl).toHaveBeenCalledWith(KEY, {
      downloadName: "Week 1 slides.pdf",
      disposition: "attachment",
      contentType: "application/pdf",
    });
  });

  it("gives a visitor of a public course only free-preview files", async () => {
    const course = { ...COURSE, isPublic: true };
    const members = fakes({ course, material: ready, role: null });
    await expect(
      fileLink(members.deps, {
        viewerId: null,
        materialId: 7,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const preview = fakes({
      course,
      material: material({ status: "ready", visibility: "preview" }),
      role: null,
    });
    await expect(
      fileLink(preview.deps, {
        viewerId: null,
        materialId: 7,
        disposition: "inline",
      }),
    ).resolves.toEqual({ url: "https://signed.test/f" });
  });

  it("never links a file that is still uploading", async () => {
    const { deps, getStorage } = fakes({ role: "member" });
    await expect(
      fileLink(deps, {
        viewerId: "u9",
        materialId: 7,
        disposition: "attachment",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(getStorage).not.toHaveBeenCalled();
  });

  it("refuses to show anything but a PDF inline", async () => {
    const { deps } = fakes({
      material: material({
        status: "ready",
        extension: "zip",
        contentType: "application/zip",
      }),
      role: "member",
    });
    await expect(
      fileLink(deps, { viewerId: "u9", materialId: 7, disposition: "inline" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("updateMaterial / deleteMaterial", () => {
  it("renames and shares a file for the course author", async () => {
    const { deps, payload } = fakes({
      material: material({ status: "ready" }),
    });
    await expect(
      updateMaterial(deps, {
        userId: "u1",
        materialId: 7,
        title: "Handout",
        visibility: "preview",
      }),
    ).resolves.toMatchObject({ title: "Handout", visibility: "preview" });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 7,
      data: { title: "Handout", visibility: "preview" },
    });
  });

  it("stores a renamed title as well-formed text", async () => {
    const { deps, payload } = fakes();
    await updateMaterial(deps, {
      userId: "u1",
      materialId: 7,
      title: `Deck \uDE00`,
    });
    expect(payload.update).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 7,
      data: { title: "Deck \uFFFD" },
    });
  });

  it("changes nothing when nothing was asked", async () => {
    const { deps, payload } = fakes();
    await updateMaterial(deps, { userId: "u1", materialId: 7 });
    expect(payload.update).not.toHaveBeenCalled();
  });

  const settled = material({ status: "ready", createdAt: ago(86_400) });

  it("removes the stored file, then the record, of a file whose upload grant has expired", async () => {
    const { deps, payload, storage } = fakes({ material: settled });
    await expect(
      deleteMaterial(deps, { userId: "u1", materialId: 7 }),
    ).resolves.toEqual({ ok: true });
    expect(storage.remove).toHaveBeenCalledWith([KEY]);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: "hosted-materials",
      id: 7,
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it.each([
    ["an upload still in progress", material()],
    [
      "a ready file whose upload grant may still be live",
      material({ status: "ready", createdAt: ago(UPLOAD_GRANT_SECONDS) }),
    ],
  ])(
    "keeps the record of %s as failed, so it still counts, and removes the stored file",
    async (_label, m) => {
      const { deps, payload, storage } = fakes({ material: m });
      await expect(
        deleteMaterial(deps, { userId: "u1", materialId: 7 }),
      ).resolves.toEqual({ ok: true });
      expect(payload.update).toHaveBeenCalledWith({
        collection: "hosted-materials",
        id: 7,
        data: { status: "failed", failureReason: "deleted" },
      });
      expect(storage.remove).toHaveBeenCalledWith([KEY]);
      expect(payload.delete).not.toHaveBeenCalled();
    },
  );

  it("still deletes the record when S3 fails, and logs the leftover", async () => {
    const { deps, payload, log } = fakes({
      material: settled,
      removeFails: true,
    });
    await deleteMaterial(deps, { userId: "u1", materialId: 7 });
    expect(log).toHaveBeenCalledWith(
      "[classroomMaterials.deleteMaterial] removing the stored file failed",
      expect.objectContaining({ materialId: 7, key: KEY }),
    );
    expect(payload.delete).toHaveBeenCalled();
  });

  it("lets only the course author manage its files", async () => {
    const { deps, payload, getStorage } = fakes();
    await expect(
      deleteMaterial(deps, { userId: "u2", materialId: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      updateMaterial(deps, { userId: "u2", materialId: 7, title: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getStorage).not.toHaveBeenCalled();
    expect(payload.delete).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});

describe("listCourseMaterials", () => {
  it("lists the course's files newest first, hiding cancelled and deleted uploads", async () => {
    const { deps, payload } = fakes({
      docs: [material({ status: "ready" })],
    });
    await expect(
      listCourseMaterials(deps, { userId: "u1", courseId: 12 }),
    ).resolves.toEqual([expect.objectContaining({ id: 7, status: "ready" })]);
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { course: { equals: 12 } },
          {
            or: [
              { status: { not_equals: "failed" } },
              { failureReason: { exists: false } },
              { failureReason: { not_in: ["cancelled", "deleted"] } },
            ],
          },
        ],
      },
      sort: "-createdAt",
      pagination: false,
      depth: 0,
    });
  });

  it("is only for the course author", async () => {
    const { deps, payload } = fakes();
    await expect(
      listCourseMaterials(deps, { userId: "u2", courseId: 12 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.find).not.toHaveBeenCalled();
  });
});

describe("mayUploadMaterials", () => {
  it("follows the community policy and the member's role", async () => {
    await expect(
      mayUploadMaterials(fakes().db as never, "c1", "u1"),
    ).resolves.toBe(true);
    await expect(
      mayUploadMaterials(fakes({ role: "member" }).db as never, "c1", "u1"),
    ).resolves.toBe(false);
    await expect(
      mayUploadMaterials(fakes({ community: false }).db as never, "c1", "u1"),
    ).resolves.toBe(false);
  });

  it("is false for everyone while uploads are switched off for the site", async () => {
    testEnv.CLASSROOM_FILE_UPLOADS = "off";
    const { db } = fakes();
    await expect(mayUploadMaterials(db as never, "c1", "u1")).resolves.toBe(
      false,
    );
    expect(db.query.communities.findFirst).not.toHaveBeenCalled();
  });
});

describe("fileUploadsEnabled", () => {
  it.each([
    ["on", true],
    ["off", false],
    [undefined, false],
  ] as const)("CLASSROOM_FILE_UPLOADS=%s → %s", (value, enabled) => {
    testEnv.CLASSROOM_FILE_UPLOADS = value;
    expect(fileUploadsEnabled()).toBe(enabled);
  });
});
