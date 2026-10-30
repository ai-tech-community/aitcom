import type { PayloadClient } from "./deps";
import { relationIdOrNull } from "./relation-id";

/** Where an issue lives: the slugs its reading URLs are built from. */
export type IssuePlace = {
  magazine: { slug: string };
  issue: { slug: string };
};

/**
 * The place of each issue, keyed by issue id: two queries, whatever the
 * number of issues. It does not check access: callers pass issue ids they
 * already know the viewer may read. An issue whose magazine is gone has no
 * place.
 */
export async function loadIssuePlaces(
  payload: Pick<PayloadClient, "find">,
  issueIds: readonly number[],
): Promise<Map<number, IssuePlace>> {
  const ids = [...new Set(issueIds)];
  if (ids.length === 0) return new Map();

  const { docs: issues } = await payload.find({
    collection: "magazine-issues",
    where: { id: { in: ids } },
    pagination: false,
    depth: 0,
    select: { slug: true, magazine: true },
  });
  const magazineIds = [
    ...new Set(
      issues.flatMap((issue) => {
        const id = relationIdOrNull(issue.magazine);
        return id === null ? [] : [id];
      }),
    ),
  ];
  const { docs: magazines } =
    magazineIds.length === 0
      ? { docs: [] }
      : await payload.find({
          collection: "magazines",
          where: { id: { in: magazineIds } },
          pagination: false,
          depth: 0,
          select: { slug: true },
        });
  const magazineSlugById = new Map(
    magazines.map((magazine) => [Number(magazine.id), magazine.slug]),
  );

  const places = new Map<number, IssuePlace>();
  for (const issue of issues) {
    const magazineId = relationIdOrNull(issue.magazine);
    const magazineSlug =
      magazineId === null ? undefined : magazineSlugById.get(magazineId);
    if (magazineSlug === undefined) continue;
    places.set(Number(issue.id), {
      magazine: { slug: magazineSlug },
      issue: { slug: issue.slug },
    });
  }
  return places;
}
