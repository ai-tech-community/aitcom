import type { z } from "zod";

import type { AppLocale } from "@/i18n/messages";
import type { IssueReaderAccess } from "@/lib/magazines/access";
import type {
  ItemKindId,
  ItemProblem,
  IssueItemView,
  UnavailableItem,
} from "@/lib/magazines/item-views";
import type { CandidateFact } from "@/lib/magazines/picker";
import type { MagazineIssue } from "@/payload-types";

import type { Deps, PayloadClient } from "../deps";
import type { MagazineCommunity } from "../magazine-service";
import type { ItemReader } from "./reader";

export type ItemCommunity = Pick<MagazineCommunity, "id" | "slug">;

export type PickerContext = {
  deps: Deps;
  magazineId: number;
  community: ItemCommunity;
  viewerId: string;
  locale: AppLocale;
};

/** What a kind's source returns; the registry adds the reference. */
export type PickerSourceCandidate<Input> = {
  input: Input;
  title: string;
  facts: CandidateFact[];
  openHref: string | null;
};

/** A candidate with its content identity in `itemReference` form. */
export type PickerCandidate<Input> = PickerSourceCandidate<Input> & {
  reference: string;
};

export interface ItemPickerSource<Input> {
  search(
    query: string,
    ctx: PickerContext,
  ): Promise<PickerSourceCandidate<Input>[]>;
}

/** What an item strategy knows about the issue it works for. */
export type ItemContext = {
  payload: PayloadClient;
  db: Deps["db"];
  magazineId: number;
  community: ItemCommunity;
  /** Null while the issue is not saved yet. */
  issueId: number | null;
  locale: AppLocale;
  /**
   * The viewer's access to the issue. Strategies decide per level with an
   * exhaustive `switch`, so a new level (slice 6 `teaser`) is a compile
   * error in every kind until the kind decides what it shows.
   */
  access: IssueReaderAccess;
  reader: ItemReader;
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
  /** Content identity, or null when the issue owns the content. */
  referenceOf(stored: Stored): string | null;
  /** Batched: every item of this kind in one issue, one query at most. */
  validate(
    items: { index: number; stored: Stored; isNew: boolean }[],
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
