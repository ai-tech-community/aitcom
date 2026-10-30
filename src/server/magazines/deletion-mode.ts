import type { CollectionConfig } from "payload";

import { Articles } from "@/collections/Articles";
import { MagazineIssues } from "@/collections/MagazineIssues";

export type DeletionMode = "soft" | "hard";

/** Soft-delete when the collection already has a deleted flag. Otherwise hard-delete. */
export function deletionMode(fieldNames: readonly string[]): DeletionMode {
  if (fieldNames.includes("deletedAt") || fieldNames.includes("isDeleted")) {
    return "soft";
  }
  return "hard";
}

function fieldNamesOf(collection: CollectionConfig): string[] {
  return collection.fields.flatMap((field) =>
    "name" in field && field.name ? [field.name] : [],
  );
}

export type DeletableCollection = "articles" | "magazine-issues";

export function collectionDeletionMode(
  collection: DeletableCollection,
): DeletionMode {
  switch (collection) {
    case "articles":
      return deletionMode(fieldNamesOf(Articles));
    case "magazine-issues":
      return deletionMode(fieldNamesOf(MagazineIssues));
    default: {
      const _exhaustive: never = collection;
      return _exhaustive;
    }
  }
}

export function softDeleteData(
  fieldNames: readonly string[],
  now: string,
): { deletedAt: string } | { isDeleted: true } {
  if (fieldNames.includes("deletedAt")) return { deletedAt: now };
  if (fieldNames.includes("isDeleted")) return { isDeleted: true };
  throw new Error("This collection has no soft-delete column.");
}
