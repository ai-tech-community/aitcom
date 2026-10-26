"use client";

// PROTOTYPE — throwaway. How the community overview (feed + sidebar) fills
// each wide frame. Variant A keeps the shipped FeedPage.

import { FeedMain, FeedPage } from "../feed/feed-page";
import { CommunitySidebar } from "../feed/community-sidebar";
import type { CommunityLayoutVariantKey } from "./variants";

type FeedProps = React.ComponentProps<typeof FeedPage>;

const STICKY_PANEL =
  "lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain";

export function PrototypeOverview({
  variant,
  ...props
}: FeedProps & { variant: CommunityLayoutVariantKey }) {
  switch (variant) {
    case "B":
      // The rail is already on the left: feed + a 20rem panel on the right.
      return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <FeedMain {...props} className="min-w-0 space-y-4" />
          <CommunitySidebar
            slug={props.slug}
            className={`flex flex-col gap-8 ${STICKY_PANEL}`}
          />
        </div>
      );
    case "C":
      // Three columns from xl: who/links left, feed centre, what's on right.
      return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[16rem_minmax(0,1fr)_22rem] 2xl:grid-cols-[18rem_minmax(0,1fr)_26rem]">
          <CommunitySidebar
            slug={props.slug}
            only={["about", "links"]}
            className={`hidden flex-col gap-8 xl:flex ${STICKY_PANEL}`}
          />
          <FeedMain {...props} className="min-w-0 space-y-4" />
          <CommunitySidebar
            slug={props.slug}
            className={`flex flex-col gap-8 xl:hidden ${STICKY_PANEL}`}
          />
          <CommunitySidebar
            slug={props.slug}
            only={["events", "ideas", "news"]}
            className={`hidden flex-col gap-8 xl:flex ${STICKY_PANEL}`}
          />
        </div>
      );
    case "D":
      // Feed at reading width; everything else becomes a board of panels.
      return (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,44rem)_minmax(0,1fr)]">
          <FeedMain {...props} className="min-w-0 space-y-4" />
          <CommunitySidebar
            slug={props.slug}
            className="grid content-start items-start gap-6 2xl:grid-cols-2 [&>section]:rounded-lg [&>section]:border [&>section]:p-4"
          />
        </div>
      );
    default:
      return <FeedPage {...props} />;
  }
}
