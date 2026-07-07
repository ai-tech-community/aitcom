import type { Payload } from "payload";

/**
 * Resolves `audiences` slugs (the stable public API vocabulary — see
 * CONTEXT.md [[audience]]) to `audiences` collection ids for writing into the
 * `events.audience` relationship field. A single `where: { slug: { in } }`
 * query; slugs with no matching audience are silently dropped. An
 * empty/undefined input, or an input where nothing matched, resolves to
 * `undefined` (mirrors every other optional field in
 * `buildEventPayloadData`: "not provided" leaves the value alone rather than
 * clearing it).
 */
export async function resolveAudienceIds(
  payload: Payload,
  slugs?: string[],
): Promise<number[] | undefined> {
  if (!slugs?.length) return undefined;

  const { docs } = await payload.find({
    collection: "audiences",
    where: { slug: { in: slugs } },
    limit: slugs.length,
    depth: 0,
  });

  return docs.length > 0 ? docs.map((doc) => doc.id) : undefined;
}
