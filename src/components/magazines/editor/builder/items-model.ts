import type { ItemProblem } from "@/lib/magazines/item-views";
import type { IssueItemInput } from "@/server/magazines/items/registry";

import { builderReferenceKey, isSavableBuilderItem } from "./items/registry";

/**
 * The issue builder's item list as pure data: one entry per issue item, in
 * issue order. `key` is the builder's own stable identity for an item (its
 * block id once saved, a fresh one before), so React rows, drag ids and
 * error highlights survive reorders and saves. Every function returns a new
 * list and leaves its input alone; a change that does nothing returns the
 * input itself.
 */
export type BuilderItem = IssueItemInput & { key: string };

/** What can stop a publish, in the order the publish dialog lists them. */
export type PublishBlocker = "NO_TITLE" | "NO_ITEMS" | "INVALID_ITEM";

let keySequence = 0;

/** A key no other item in this page has. */
export function newItemKey(): string {
  keySequence += 1;
  return `new-${keySequence}`;
}

/** Saved items (block ids kept) → builder items keyed by their block id. */
export function toBuilderItems(inputs: IssueItemInput[]): BuilderItem[] {
  return inputs.map((input) => ({ ...input, key: input.id ?? newItemKey() }));
}

/**
 * Builder items → what `setIssueItems` takes. An item saved after it was
 * added has no `id` in the draft; `savedIds` (key → block id) gives it the
 * block id its first save got, so Payload keeps that block.
 */
export function toItemInputs(
  items: BuilderItem[],
  savedIds: ReadonlyMap<string, string> = new Map(),
): IssueItemInput[] {
  return items.map(({ key, ...input }) => {
    const id = input.id ?? savedIds.get(key);
    return (id ? { ...input, id } : input) as IssueItemInput;
  });
}

/** The list with the item at `from` moved to `to`. */
export function moveItem(
  items: BuilderItem[],
  from: number,
  to: number,
): BuilderItem[] {
  const inRange = (i: number) => i >= 0 && i < items.length;
  if (from === to || !inRange(from) || !inRange(to)) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function removeItem(items: BuilderItem[], key: string): BuilderItem[] {
  return items.filter((item) => item.key !== key);
}

/**
 * The item at the end of the issue. Content an item references (an
 * article) is in an issue at most once: adding it again changes nothing.
 */
export function addItem(
  items: BuilderItem[],
  input: IssueItemInput,
  key = newItemKey(),
): BuilderItem[] {
  const added = { ...input, key } as BuilderItem;
  const reference = builderReferenceKey(added);
  if (
    reference !== null &&
    items.some((item) => builderReferenceKey(item) === reference)
  ) {
    return items;
  }
  return [...items, added];
}

/**
 * Whether the server would accept the item as it is (its kind's rule).
 * Unsavable items stay in the builder, out of each save, until they are
 * finished.
 */
export function isSavableItem(item: BuilderItem): boolean {
  return isSavableBuilderItem(item);
}

/**
 * Everything that stops a publish now: no title, no items, or an item the
 * server reported a problem with (`getIssueForEditing.problems`) or that is
 * not finished yet.
 */
export function publishBlockers(input: {
  title: string;
  items: BuilderItem[];
  problems: ItemProblem[];
}): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (input.title.trim() === "") blockers.push("NO_TITLE");
  if (input.items.length === 0) blockers.push("NO_ITEMS");
  if (
    input.problems.length > 0 ||
    input.items.some((item) => !isSavableItem(item))
  ) {
    blockers.push("INVALID_ITEM");
  }
  return blockers;
}
