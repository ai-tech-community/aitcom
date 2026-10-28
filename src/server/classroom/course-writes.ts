import type { Where } from "payload";

import type { Lesson } from "@/payload-types";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type LessonVersion = { id: number; updatedAt: string };

/**
 * Create a module the way the classroom builder does. The first module on a
 * flat course wraps every existing lesson so the course is not mixed.
 */
export async function createCourseModule(
  payload: Payload,
  courseId: number,
  input: { title: string; summary?: string | null },
): Promise<{ id: number; lessons: LessonVersion[] }> {
  const { totalDocs: moduleCount } = await payload.find({
    collection: "modules",
    where: { course: { equals: courseId } },
    limit: 0,
    depth: 0,
  });
  const transactionID = await payload.db.beginTransaction();
  const req = transactionID ? { transactionID } : undefined;
  try {
    const moduleDoc = await payload.create({
      collection: "modules",
      data: {
        course: courseId,
        title: input.title,
        order: moduleCount,
        summary: input.summary ?? undefined,
      },
      req,
    });
    let lessons: LessonVersion[] = [];
    if (moduleCount === 0) {
      const { docs } = await payload.update({
        collection: "lessons",
        where: { course: { equals: courseId } },
        data: { module: moduleDoc.id },
        req,
      });
      lessons = docs.map((doc) => ({ id: doc.id, updatedAt: doc.updatedAt }));
    }
    if (transactionID) await payload.db.commitTransaction(transactionID);
    return { id: moduleDoc.id, lessons };
  } catch (error) {
    if (transactionID) await payload.db.rollbackTransaction(transactionID);
    throw error;
  }
}

export async function updateCourseModule(
  payload: Payload,
  moduleId: number,
  input: { title?: string; summary?: string | null },
): Promise<void> {
  const data: { title?: string; summary?: string | null } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  await payload.update({
    collection: "modules",
    id: moduleId,
    data,
  });
}

export async function updateCourseFields(
  payload: Payload,
  courseId: number,
  input: {
    title?: string;
    summary?: string | null;
    coverImageUrl?: string | null;
    status?: "draft" | "published";
  },
): Promise<void> {
  const data: {
    title?: string;
    summary?: string | null;
    coverImageUrl?: string | null;
    status?: "draft" | "published";
  } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.coverImageUrl !== undefined)
    data.coverImageUrl = input.coverImageUrl;
  if (input.status !== undefined) data.status = input.status;
  await payload.update({ collection: "courses", id: courseId, data });
}

/** Append a lesson. A plain-text body is already Lexical when it arrives here. */
export async function createCourseLesson(
  payload: Payload,
  input: {
    courseId: number;
    moduleId?: number | null;
    title: string;
    body?: Lesson["body"];
  },
): Promise<{ id: number }> {
  const where: Where =
    input.moduleId != null
      ? { module: { equals: input.moduleId } }
      : { course: { equals: input.courseId } };
  const { docs: last } = await payload.find({
    collection: "lessons",
    where,
    sort: "-order",
    limit: 1,
    depth: 0,
  });
  const lesson = await payload.create({
    collection: "lessons",
    data: {
      course: input.courseId,
      title: input.title,
      order: (last[0]?.order ?? -1) + 1,
      ...(input.moduleId != null ? { module: input.moduleId } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
    },
  });
  return { id: lesson.id };
}

export async function updateCourseLesson(
  payload: Payload,
  lessonId: number,
  input: { title?: string; body?: Lesson["body"] },
): Promise<void> {
  const data: { title?: string; body?: Lesson["body"] } = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  await payload.update({ collection: "lessons", id: lessonId, data });
}
