import { TRPCError } from "@trpc/server";

import { collectMaterialIds, isMaterialId } from "@/lib/classroom/lesson-body";
import {
  buildMaterialsManifest,
  type MaterialViewer,
  type MaterialsManifest,
} from "@/lib/classroom/material-access";
import { EXISTING_MATERIAL } from "@/server/classroom/hosted-files";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * Where lesson bodies meet hosted materials (spec 2026-09-27 §3.2–3.3).
 */

/**
 * Every HostedFile block must carry a usable id, and no id may belong to a
 * different course: otherwise a public course's lesson could point at
 * another course's members-only file. An id that no longer exists is
 * allowed — the author deleted that file, and the lesson shows it as
 * removed — so deleting a file never makes its lessons unsaveable.
 */
export async function assertLessonMaterials(
  payload: Payload,
  courseId: number,
  body: unknown,
): Promise<void> {
  if (body === undefined || body === null) return;
  const ids = collectMaterialIds(body);
  if (ids.length === 0) return;
  if (!ids.every(isMaterialId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
  }
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { id: { in: [...new Set(ids)] } },
        { course: { not_equals: courseId } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  if (docs.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "INVALID_MATERIAL" });
  }
}

/**
 * The read-time manifest for a course's lessons: one summary per referenced
 * file, as this viewer may see it. Only the course's own files are looked
 * up, so a crafted id can never surface another course's file; a file the
 * author deleted (or whose upload was cancelled) reads as removed. No links:
 * the lesson asks for one only when a file is opened.
 */
export async function loadMaterialsManifest(
  payload: Payload,
  input: {
    courseId: number;
    bodies: readonly unknown[];
    viewer: MaterialViewer;
  },
): Promise<MaterialsManifest> {
  const ids = [
    ...new Set(input.bodies.flatMap((body) => collectMaterialIds(body))),
  ].filter(isMaterialId);
  if (ids.length === 0) return {};
  const { docs } = await payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { id: { in: ids } },
        { course: { equals: input.courseId } },
        EXISTING_MATERIAL,
      ],
    },
    pagination: false,
    depth: 0,
  });
  return buildMaterialsManifest(ids, docs, input.viewer);
}
