/**
 * The id a Payload relationship holds, whether it came back as an id
 * (`depth: 0`) or as the related document; null when it is empty.
 */
export function relationId(
  relation: number | { id: number } | null | undefined,
): number | null {
  if (relation === null || relation === undefined) return null;
  return typeof relation === "number" ? relation : relation.id;
}
