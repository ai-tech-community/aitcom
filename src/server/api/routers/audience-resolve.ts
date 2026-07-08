import type { Payload } from "payload";

/**
 * Resolves `audiences` slugs (the stable public API vocabulary — see
 * CONTEXT.md [[audience]]) to `audiences` collection ids for writing into the
 * `events.audience` relationship field. A single `where: { slug: { in } }`
 * query; slugs with no matching audience are silently dropped.
 *
 * `undefined` input ("not provided") resolves to `undefined`, mirroring every
 * other optional field in `buildEventPayloadData`: leaves the value alone
 * rather than clearing it. A **defined** empty array is an explicit clear
 * (#210) and resolves to `[]` — callers that want create-path
 * omit-when-empty semantics must check `slugs?.length` before calling. An
 * input where nothing matched still resolves to `undefined` (same as
 * "not provided" — there is nothing to clear or set).
 */
export async function resolveAudienceIds(
  payload: Payload,
  slugs?: string[],
): Promise<number[] | undefined> {
  if (slugs === undefined) return undefined;
  if (slugs.length === 0) return [];

  const { docs } = await payload.find({
    collection: "audiences",
    where: { slug: { in: slugs } },
    limit: slugs.length,
    depth: 0,
  });

  return docs.length > 0 ? docs.map((doc) => doc.id) : undefined;
}
