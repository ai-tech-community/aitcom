import { z } from "zod";

import type {
  EditorItemView,
  ItemKindId,
  ItemProblem,
  UnavailableItem,
} from "@/lib/magazines/item-views";

import { articleItemKind } from "./article/kind";
import { editorialItemKind } from "./editorial/kind";
import { itemIdOf } from "./item-id";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "./types";

/**
 * The item registry (ADR-0043): every kind id maps to its strategy. This
 * record is the only place that names the kinds; everything below groups
 * an issue's blocks by kind and dispatches through `ITEM_KINDS[kind]`.
 * Adding a kind is one folder under `items/` plus one entry here.
 */
const STRATEGIES = {
  article: articleItemKind,
  editorial: editorialItemKind,
};

/** The builder input type a kind's strategy declares. */
type InputOf<K extends ItemKindId> =
  (typeof STRATEGIES)[K] extends IssueItemKind<K, infer Input, StoredItem<K>>
    ? Input
    : never;

/**
 * One strategy per kind id: a kind without a strategy, or a strategy whose
 * stored shape is not its Payload block, is a compile error.
 */
export type ItemKindRegistry = {
  [K in ItemKindId]: IssueItemKind<K, InputOf<K>, StoredItem<K>>;
};

export const ITEM_KINDS: ItemKindRegistry = STRATEGIES;

/** An issue item block as Payload stores it in `magazine-issues.items`. */
export type StoredBlock = {
  blockType: ItemKindId;
  id?: string | null;
} & Record<string, unknown>;

type KindInputSchema = ItemKindRegistry[ItemKindId]["input"];

/** The builder input of any item: one kind's input, picked by `kind`. */
export const issueItemInputSchema = z.discriminatedUnion(
  "kind",
  Object.values(ITEM_KINDS).map((strategy) => strategy.input) as [
    KindInputSchema,
    ...KindInputSchema[],
  ],
);

export type IssueItemInput = z.infer<typeof issueItemInputSchema>;

type InputsByKind = { [K in ItemKindId]: InputOf<K> };

function storeOne<K extends ItemKindId>(
  kind: K,
  input: InputsByKind[K],
): StoredBlock {
  return {
    blockType: kind,
    ...ITEM_KINDS[kind].toStored(input),
    // Keep a saved item's block id: reading-page anchors and builder keys
    // must survive a save (preflight F5).
    ...(input.id ? { id: input.id } : {}),
  };
}

/** Builder inputs → Payload `items` blocks, in order. */
export function toStoredItems(inputs: IssueItemInput[]): StoredBlock[] {
  return inputs.map((input) => storeOne(input.kind, input));
}

/**
 * The boundary from Payload's block list to one kind's stored shape: Payload
 * stores each block with the fields of its `blockType`'s block config, which
 * `StoredItem<K>` is generated from.
 */
function asStored<K extends ItemKindId>(block: StoredBlock): StoredItem<K> {
  return block as unknown as StoredItem<K>;
}

function inputOne<K extends ItemKindId>(
  kind: K,
  block: StoredBlock,
): InputOf<K> {
  return ITEM_KINDS[kind].toInput(asStored<K>(block));
}

/** Payload `items` blocks → builder inputs, in order, block ids kept. */
export function toItemInputs(blocks: StoredBlock[]): IssueItemInput[] {
  return blocks.map((block) => inputOne(block.blockType, block));
}

type IndexedBlock = { index: number; block: StoredBlock };

function groupByKind(blocks: StoredBlock[]): Map<ItemKindId, IndexedBlock[]> {
  const groups = new Map<ItemKindId, IndexedBlock[]>();
  blocks.forEach((block, index) => {
    const group = groups.get(block.blockType) ?? [];
    group.push({ index, block });
    groups.set(block.blockType, group);
  });
  return groups;
}

function validateKind<K extends ItemKindId>(
  kind: K,
  group: IndexedBlock[],
  ctx: ItemContext,
): Promise<ItemProblem[]> {
  return ITEM_KINDS[kind].validate(
    group.map(({ index, block }) => ({ index, stored: asStored<K>(block) })),
    ctx,
  );
}

/**
 * Every problem with an issue's items, in item order. One batched check per
 * kind present in the issue.
 */
export async function validateIssueItems(
  blocks: StoredBlock[],
  ctx: ItemContext,
): Promise<ItemProblem[]> {
  const perKind = await Promise.all(
    [...groupByKind(blocks)].map(([kind, group]) =>
      validateKind(kind, group, ctx),
    ),
  );
  return perKind.flat().sort((a, b) => a.itemIndex - b.itemIndex);
}

function isUnavailable(view: EditorItemView): view is UnavailableItem {
  return "unavailable" in view;
}

/**
 * One kind's views by block id. For readers, unavailable and unreadable
 * items are left out.
 */
async function loadKind<K extends ItemKindId>(
  kind: K,
  group: IndexedBlock[],
  ctx: ItemContext,
): Promise<Map<string, EditorItemView>> {
  const strategy = ITEM_KINDS[kind];
  const views: Map<string, ItemViewOf<K> | UnavailableItem> =
    await strategy.load(
      group.map(({ block }) => asStored<K>(block)),
      ctx,
    );
  const shown = new Map<string, EditorItemView>();
  for (const [itemId, view] of views) {
    if (ctx.editor) {
      shown.set(itemId, view);
    } else if (!isUnavailable(view) && strategy.isReadable(view, ctx)) {
      shown.set(itemId, view);
    }
  }
  return shown;
}

/**
 * An issue's items as views, in issue order. Readers get readable views
 * only; editors also get `UnavailableItem` markers in place. One batched
 * load per kind present in the issue.
 */
export async function loadIssueItemViews(
  blocks: StoredBlock[],
  ctx: ItemContext,
): Promise<EditorItemView[]> {
  const loaded = new Map<ItemKindId, Map<string, EditorItemView>>(
    await Promise.all(
      [...groupByKind(blocks)].map(
        async ([kind, group]) =>
          [kind, await loadKind(kind, group, ctx)] as const,
      ),
    ),
  );
  const views: EditorItemView[] = [];
  for (const block of blocks) {
    const itemId = itemIdOf(block);
    const view = loaded.get(block.blockType)?.get(itemId);
    if (view) {
      views.push(view);
    } else if (ctx.editor) {
      // A strategy that returns nothing for an item: mark it, never hide it
      // from the editor.
      views.push({
        kind: block.blockType,
        itemId,
        unavailable: true,
        reason: "missing",
      });
    }
  }
  return views;
}
