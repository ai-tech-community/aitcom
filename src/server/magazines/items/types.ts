import type { z } from "zod";

import type { AppLocale } from "@/i18n/messages";
import type {
  ItemKindId,
  ItemProblem,
  IssueItemView,
  UnavailableItem,
} from "@/lib/magazines/item-views";
import type { MagazineIssue } from "@/payload-types";

import type { PayloadClient } from "../deps";

/** What an item strategy knows about the issue it works for. */
export type ItemContext = {
  payload: PayloadClient;
  magazineId: number;
  /** Null while the issue is not saved yet. */
  issueId: number | null;
  locale: AppLocale;
  /** A magazine editor: sees latest draft text and unavailable markers. */
  editor: boolean;
};

type IssueItemBlock = NonNullable<MagazineIssue["items"]>[number];

/**
 * One kind's block as Payload stores it in `magazine-issues.items`, without
 * the `blockType` discriminator (the registry owns that). Derived from the
 * generated types, so it always matches the kind's `block.ts`.
 */
export type StoredItem<K extends ItemKindId> = Omit<
  Extract<IssueItemBlock, { blockType: K }>,
  "blockType" | "blockName"
>;

/** The view one kind produces. */
export type ItemViewOf<K extends ItemKindId> = Extract<
  IssueItemView,
  { kind: K }
>;

/**
 * The strategy for one issue item kind (ADR-0043). Each kind lives in
 * `items/<kind>/kind.ts`; the registry dispatches through `ITEM_KINDS` and
 * never switches on the kind.
 */
export interface IssueItemKind<
  K extends ItemKindId,
  Input extends { kind: K; id?: string },
  Stored extends { id?: string | null; intro?: string | null },
> {
  readonly kind: K;
  /**
   * The builder input for this kind: an object schema whose `kind` literal
   * lets the registry join every kind into one discriminated union.
   */
  readonly input: z.ZodType<Input> & z.core.$ZodTypeDiscriminable;
  /** Builder input → Payload block data (without `blockType` and `id`). */
  toStored(input: Input): Omit<Stored, "id">;
  /** Payload block data → builder input, keeping the block id. */
  toInput(stored: Stored): Input;
  /** Batched: every item of this kind in one issue, one query at most. */
  validate(
    items: { index: number; stored: Stored }[],
    ctx: ItemContext,
  ): Promise<ItemProblem[]>;
  /**
   * Batched: one query per kind per issue, never one per item. Keyed by
   * block id.
   */
  load(
    items: Stored[],
    ctx: ItemContext,
  ): Promise<Map<string, ItemViewOf<K> | UnavailableItem>>;
  /** Whether a reader (not an editor) may see a loaded view. */
  isReadable(view: ItemViewOf<K>, ctx: ItemContext): boolean;
}
