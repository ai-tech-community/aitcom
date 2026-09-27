import type { VignetteKey } from "./vignettes";

/**
 * The homepage "What we do" groups and where each one leads. Link labels
 * reuse the navigation's names (`nav.*`) so the section and the menu call
 * every place the same thing; each link also gets a short hint
 * (`whatWeDo.groups.<group>.links.<nav>`).
 */
export interface WhatWeDoLink {
  href: string;
  nav: string;
}

export interface WhatWeDoGroup {
  key: VignetteKey;
  links: readonly WhatWeDoLink[];
}

export const WHAT_WE_DO_GROUPS = [
  {
    key: "gather",
    links: [
      { href: "/communities", nav: "communities" },
      { href: "/events", nav: "events" },
      { href: "/members", nav: "members" },
    ],
  },
  {
    key: "build",
    links: [
      { href: "/challenges", nav: "challenges" },
      { href: "/launchpad", nav: "launchpad" },
      { href: "/ideas", nav: "ideas" },
      { href: "/agents", nav: "agents" },
    ],
  },
  {
    key: "work",
    links: [
      { href: "/roles", nav: "roles" },
      { href: "/jobs", nav: "jobs" },
      { href: "/startups", nav: "startups" },
    ],
  },
  {
    key: "learn",
    links: [
      { href: "/benchmark", nav: "benchmark" },
      { href: "/investigations", nav: "investigations" },
      { href: "/blog", nav: "blog" },
      { href: "/impact", nav: "impact" },
    ],
  },
] as const satisfies readonly WhatWeDoGroup[];
