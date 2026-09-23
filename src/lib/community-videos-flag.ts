import { env } from "@/env";

/** Community short videos (ADR-0036). Remove once the feature is final. */
export const isCommunityVideosEnabled = () =>
  env.NEXT_PUBLIC_FEATURE_COMMUNITY_VIDEOS === "true";
