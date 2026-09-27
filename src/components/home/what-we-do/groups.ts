import type { VignetteKey } from "./vignettes";

/**
 * The homepage "What we do" groups and the one place each leads. Every
 * group links to its main destination only; the group's other pages
 * (members, launchpad, ideas, agents, roles, startups, benchmark,
 * investigations, impact) stay one click away in the navigation, so the
 * homepage does not repeat the menu. Copy lives in
 * `whatWeDo.groups.<group>.{title,description,link}`.
 */
export interface WhatWeDoGroup {
  key: VignetteKey;
  href: string;
}

export const WHAT_WE_DO_GROUPS = [
  { key: "gather", href: "/communities" },
  { key: "build", href: "/challenges" },
  { key: "work", href: "/jobs" },
  { key: "learn", href: "/blog" },
] as const satisfies readonly WhatWeDoGroup[];
