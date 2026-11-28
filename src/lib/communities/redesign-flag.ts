import { env } from "@/env";

export const isOpenCommunitiesEnabled = () =>
  env.NEXT_PUBLIC_FEATURE_OPEN_COMMUNITIES === "true";
