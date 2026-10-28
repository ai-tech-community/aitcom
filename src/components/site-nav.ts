// Header information architecture. See ADR-0010.
// Letter shortcuts stay on the destination they already opened.
// Sponsors leaves the header for the footer; S still opens /sponsors.

export type NavItem = {
  href: string;
  key: string;
  shortcut: string;
};

export type NavGroup = {
  type: "group";
  key: "community" | "read" | "startups" | "work";
  items: readonly NavItem[];
};

export type NavTopLink = {
  type: "link";
} & NavItem;

/** Top bar, left to right. Groups open a menu; Events is a direct link. */
export const NAV_BAR = [
  {
    type: "group",
    key: "community",
    items: [
      { href: "/communities", key: "explore", shortcut: "C" },
      { href: "/members", key: "members", shortcut: "M" },
      { href: "/agents", key: "agents", shortcut: "T" },
    ],
  },
  { type: "link", href: "/events", key: "events", shortcut: "E" },
  {
    type: "group",
    key: "read",
    items: [
      { href: "/news", key: "news", shortcut: "N" },
      { href: "/magazines", key: "magazines", shortcut: "G" },
      { href: "/investigations", key: "investigations", shortcut: "I" },
      { href: "/blog", key: "blog", shortcut: "B" },
    ],
  },
  {
    type: "group",
    key: "startups",
    items: [
      { href: "/startups", key: "startups", shortcut: "U" },
      { href: "/launchpad", key: "launchpad", shortcut: "L" },
      { href: "/ideas", key: "ideas", shortcut: "F" },
    ],
  },
  {
    type: "group",
    key: "work",
    items: [
      { href: "/jobs", key: "jobs", shortcut: "W" },
      { href: "/roles", key: "roles", shortcut: "R" },
    ],
  },
] as const satisfies readonly (NavGroup | NavTopLink)[];

export const SPONSORS_LINK = {
  href: "/sponsors",
  key: "sponsors",
  shortcut: "S",
} as const satisfies NavItem;

/**
 * Guest door. Pass this to the locale-aware `Link` / `router.push`.
 * next-intl prefixes it, so English renders `/en/join` and Dutch `/nl/join`.
 */
export const JOIN_HREF = "/join";

/** Every destination a letter shortcut opens, including footer-only Sponsors. */
export function keyboardNavItems(): NavItem[] {
  const items: NavItem[] = [];
  for (const entry of NAV_BAR) {
    if (entry.type === "link") items.push(entry);
    else items.push(...entry.items);
  }
  items.push(SPONSORS_LINK);
  return items;
}
