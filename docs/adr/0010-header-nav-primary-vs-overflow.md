# Header nav: grouped menus

**Status:** accepted

The global `Navbar` ([src/components/navbar.tsx](../../src/components/navbar.tsx))
used to put six destinations inline and the rest behind More. That split
is replaced by five top-level entries. The link list lives in
[src/components/site-nav.ts](../../src/components/site-nav.ts).

## Decisions

### 1. Five top-level entries, in this order

1. **Community** (menu): `/communities` (Explore), `/members`, `/agents`, `/communities/ait/forum` (Forum), `/ideas`
2. **Events**: `/events`, a direct link
3. **Read** (menu): `/news`, `/magazines`, `/investigations`, `/blog`
4. **Startups** (menu): `/startups`, `/startups/ai-tools-list` (AI tools), `/launchpad`
5. **Work** (menu): `/jobs` and `/roles`, kept as two URLs

Each menu item has a one-line description in English and Dutch. Letter
shortcuts are unchanged (`C` still opens Explore, `W` still opens Jobs,
`R` still opens Roles, and so on).

**Sponsors** is not in the header. The footer links to `/sponsors`. The
`S` shortcut still opens that page.

Guests get a Join control on the right of the bar, in both the desktop
cluster and the mobile cluster. It uses the locale-aware link to `/join`,
which renders as `/en/join` or `/nl/join`. `J` follows that same path.

### 2. Every destination is in the server HTML

Menu panels stay in the document when closed (`hidden`, not unmounted),
so a server render of the header contains every `href` without waiting
for a click. The mobile drawer repeats the same groups and is portaled
out of the bar (the bar's backdrop blur would trap a fixed child).

Group triggers are `<button>` elements with `aria-expanded` and
`aria-controls`. Arrow keys move through the open menu. Escape closes
it and returns focus to the trigger.

### 3. The hamburger stays until `lg`

Below `lg`, the inline bar is hidden and the drawer is the nav. The
drawer uses the same groups, the same descriptions, and the same
`aria-expanded` buttons.

### 4. Signed-in actions stay in the avatar menu

Dashboard (`D`), My Agent (`A`), and Sign Out stay in the avatar menu.
Language and the notification bell stay inline. This part is unchanged.

## Consequences

- A new top-level destination is an IA decision: it joins an existing
  group or earns a new one. It does not grow a More menu.
- Reversing this means putting destinations back at equal volume.
