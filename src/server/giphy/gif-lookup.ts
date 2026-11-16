import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { Gif, GiphyClient } from "@/server/giphy/giphy";

/** A GIPHY id as a member's pick names it, before it is looked up. */
export const giphyIdSchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/);

/** A GIF as a post or a message stores it: without the picker's preview. */
export type StoredGif = Omit<Gif, "preview">;

/** The `gif` group a post or a message stores for a GIF looked up from GIPHY. */
export function gifFields(gif: Gif): StoredGif {
  return {
    giphyId: gif.giphyId,
    title: gif.title,
    mp4Url: gif.mp4Url,
    stillUrl: gif.stillUrl,
    width: gif.width,
    height: gif.height,
  };
}

/**
 * A GIF to put on a post or a message, looked up by its GIPHY id, so a post
 * or a message only ever stores GIPHY's own media addresses.
 */
export async function lookUpGif(
  getGiphy: (() => GiphyClient) | undefined,
  giphyId: string,
): Promise<Gif> {
  if (!getGiphy) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GIFs are not available right now.",
    });
  }
  const gif = await getGiphy().byId(giphyId);
  if (!gif) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That GIF is not available. Pick another one.",
    });
  }
  return gif;
}
