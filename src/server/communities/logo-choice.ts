import { TRPCError } from "@trpc/server";

export type CommunityLogoChoice =
  | { kind: "skip" }
  | { kind: "url"; logoUrl: string | null }
  | { kind: "media"; mediaId: number | null };

/**
 * `logoUrl` stays for callers that already send a URL. `logoMediaId` is a
 * media id from upload-image, the same shape as the banner and the magazine
 * logo. One call sends one of them.
 */
export function communityLogoChoice(input: {
  logoUrl?: string | null;
  logoMediaId?: number | null;
}): CommunityLogoChoice {
  const hasUrl = input.logoUrl !== undefined;
  const hasMedia = input.logoMediaId !== undefined;
  if (hasUrl && hasMedia) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Send logoUrl or logoMediaId, not both.",
    });
  }
  if (hasMedia) return { kind: "media", mediaId: input.logoMediaId ?? null };
  if (hasUrl) return { kind: "url", logoUrl: input.logoUrl ?? null };
  return { kind: "skip" };
}
