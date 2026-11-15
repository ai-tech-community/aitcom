import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";

type Community = RouterOutputs["communities"]["getBySlug"];

/**
 * The community's banner across the full width of its Overview. A fixed,
 * modest height (the image is cropped to fit) keeps the community rail and
 * its tabs in view below it. Nothing when the community has no banner.
 */
export function CommunityBanner({
  community,
  className,
}: {
  community: Pick<Community, "bannerUrl" | "bannerAlt">;
  className?: string;
}) {
  if (!community.bannerUrl) return null;
  return (
    // Uploaded hosts are not limited to next/image's allow list.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={community.bannerUrl}
      alt={community.bannerAlt ?? ""}
      data-community-banner=""
      className={cn(
        "border-border h-32 w-full rounded-lg border object-cover sm:h-40 lg:h-44",
        className,
      )}
    />
  );
}
