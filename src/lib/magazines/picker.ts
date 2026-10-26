import type { ItemKindId } from "./item-views";

export const PICKABLE_ITEM_KINDS = [
  "article",
  "storyline",
  "newsItem",
] as const satisfies readonly ItemKindId[];

export type PickableKindId = (typeof PICKABLE_ITEM_KINDS)[number];

/** Structured facts that the picker formats in the viewer's language. */
export type CandidateFact =
  | { type: "byline"; name: string }
  | { type: "source"; host: string }
  | {
      type: "date";
      label: "updated" | "published" | "starts" | "lastActive";
      at: string;
    }
  | { type: "count"; what: "sources" | "replies" | "upvotes"; value: number }
  | { type: "eventStatus"; status: "cancelled" | "completed" };

export const PICKER_LIMIT = 12;
