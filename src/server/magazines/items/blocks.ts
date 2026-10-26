import type { Block } from "payload";

import { articleItemBlock } from "./article/block";
import { editorialItemBlock } from "./editorial/block";
import { storylineItemBlock } from "./storyline/block";
import { newsItemBlock } from "./newsItem/block";

/**
 * The `items` blocks of the `magazine-issues` collection, one per item kind
 * (ADR-0043). Imports only the pure `block.ts` configs so the Payload config
 * stays free of server code. The item registry's kind ids must equal these
 * slugs, in this order.
 */
export const ISSUE_ITEM_BLOCKS: Block[] = [
  articleItemBlock,
  editorialItemBlock,
  storylineItemBlock,
  newsItemBlock,
];
