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
      // Locale-aware Link prefixes this to /en/forum and /nl/forum.
      // O, because F is Ideas.
      { href: "/forum", key: "forum", shortcut: "O" },
      { href: "/ideas", key: "ideas", shortcut: "F" },
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
      // Directory of agent and model startups. K, because A is My Agent.
      { href: "/startups/ai-tools-list", key: "aiTools", shortcut: "K" },
      { href: "/launchpad", key: "launchpad", shortcut: "L" },
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
 * Join opens account creation directly (with a link to sign in).
 * Pass this to the locale-aware `Link` / `router.push`; next-intl prefixes it.
 * The public /join landing can redirect a leftover session cookie to the Hub.
 */
export const JOIN_HREF = "/auth/signup";

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
