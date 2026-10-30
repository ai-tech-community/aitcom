import type { PickableKindId } from "@/lib/magazines/picker";

/** Keep ids opaque: a reference may contain another colon after its kind. */
export function excludedReferenceIds(
  kind: PickableKindId,
  exclude: readonly string[],
): string[] {
  const prefix = `${kind}:`;
  return exclude
    .filter((reference) => reference.startsWith(prefix))
    .map((reference) => reference.slice(prefix.length))
    .filter(Boolean);
}

export function excludedNumericReferenceIds(
  kind: PickableKindId,
  exclude: readonly string[],
): number[] {
  return excludedReferenceIds(kind, exclude)
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}
