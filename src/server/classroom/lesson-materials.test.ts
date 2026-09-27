import { describe, expect, it, vi } from "vitest";

import { hostedFileBlockNode } from "@/lib/classroom/lesson-body";

import { EXISTING_MATERIAL } from "./hosted-files";
import {
  assertLessonMaterials,
  loadMaterialsManifest,
} from "./lesson-materials";

const root = (children: unknown[]) => ({
  root: {
    type: "root",
    format: "",
    indent: 0,
    version: 1,
    direction: null,
    children,
  },
});
const withFiles = (...ids: number[]) =>
  root(ids.map((id, i) => hostedFileBlockNode(id, `block${i}`)));
const para = {
  type: "paragraph",
  version: 1,
  children: [{ type: "text", version: 1, text: "notes" }],
};

function payloadFinding(docs: unknown[]) {
  return { find: vi.fn().mockResolvedValue({ docs }) };
}

describe("assertLessonMaterials", () => {
  it("does nothing for a body without file blocks", async () => {
    const payload = payloadFinding([]);
    for (const body of [undefined, null, root([para])]) {
      await expect(
        assertLessonMaterials(payload as never, 12, body),
      ).resolves.toBeUndefined();
    }
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("refuses a file block without a usable id, without asking the database", async () => {
    const payload = payloadFinding([]);
    await expect(
      assertLessonMaterials(payload as never, 12, withFiles(5, 0)),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "INVALID_MATERIAL",
    });
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("refuses a file that belongs to another course", async () => {
    const payload = payloadFinding([{ id: 6 }]);
    await expect(
      assertLessonMaterials(payload as never, 12, withFiles(5, 6, 5)),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "INVALID_MATERIAL",
    });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [{ id: { in: [5, 6] } }, { course: { not_equals: 12 } }],
      },
      limit: 1,
      depth: 0,
    });
  });

  it("accepts this course's files and files that were since deleted", async () => {
    await expect(
      assertLessonMaterials(payloadFinding([]) as never, 12, withFiles(5, 99)),
    ).resolves.toBeUndefined();
  });
});

describe("loadMaterialsManifest", () => {
  const file = (id: number, visibility: "members" | "preview") => ({
    id,
    kind: "file",
    title: `File ${id}`,
    extension: "pdf",
    contentType: "application/pdf",
    bytes: 100,
    status: "ready",
    visibility,
    storageKey: `private/classroom/c/12/${id}.pdf`,
  });

  it("looks up only this course's files and describes every referenced id", async () => {
    const payload = payloadFinding([file(5, "members"), file(6, "preview")]);
    const manifest = await loadMaterialsManifest(payload as never, {
      courseId: 12,
      bodies: [withFiles(5, 6), null, withFiles(5, 99)],
      viewer: "visitor",
    });
    expect(payload.find).toHaveBeenCalledWith({
      collection: "hosted-materials",
      where: {
        and: [
          { id: { in: [5, 6, 99] } },
          { course: { equals: 12 } },
          EXISTING_MATERIAL,
        ],
      },
      pagination: false,
      depth: 0,
    });
    expect(manifest[5]).toMatchObject({ access: "join", title: "File 5" });
    expect(manifest[6]).toMatchObject({ access: "download", title: "File 6" });
    expect(manifest[99]).toEqual({ access: "removed" });
    expect(JSON.stringify(manifest)).not.toContain("private/classroom");
  });

  it("skips the lookup when no lesson uses a file", async () => {
    const payload = payloadFinding([]);
    await expect(
      loadMaterialsManifest(payload as never, {
        courseId: 12,
        bodies: [root([para]), null],
        viewer: "member",
      }),
    ).resolves.toEqual({});
    expect(payload.find).not.toHaveBeenCalled();
  });
});
