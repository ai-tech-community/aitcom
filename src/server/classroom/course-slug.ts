import { classroomCourseSlug } from "@/server/classroom/agent-course-draft";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * `dutch-from-zero`, or `dutch-from-zero-2` when that address is already a
 * course. The suffix is a short number, and only on collision.
 */
export async function uniqueClassroomCourseSlug(
  payload: Payload,
  title: string,
  ignoreSlug?: string,
): Promise<string> {
  const base = classroomCourseSlug(title);
  const { docs } = await payload.find({
    collection: "courses",
    where: {
      or: [{ slug: { equals: base } }, { slug: { like: base } }],
    },
    depth: 0,
    limit: 100,
    pagination: false,
  });
  const prefix = `${base}-`;
  const taken = new Set<string>();
  for (const doc of docs) {
    const slug = doc.slug;
    if (!slug || slug === ignoreSlug) continue;
    if (
      slug === base ||
      (slug.startsWith(prefix) && /^\d+$/.test(slug.slice(prefix.length)))
    ) {
      taken.add(slug);
    }
  }
  return classroomCourseSlug(title, taken);
}
