# Header nav: primary five + overflow menu

**Status:** accepted

The global `Navbar` ([src/components/navbar.tsx](../../src/components/navbar.tsx))
renders 11 equally-weighted top-level destinations inline above `md`
(768px). With the right-hand cluster (LanguageSwitcher, Dashboard,
My Agent, NotificationBell, Sign Out) competing for the same row,
the bar overflows or wraps across the entire `md`–`xl` range. There
is also no IA signal — every surface, from `/benchmark` (flagship)
to `/sponsors` (about-the-org page), shouts at the same volume.

This ADR pins the structural choice. It does not specify visual
detail, animation, or copy — only the decisions that are hard to
reverse and surprising without context.

## Decisions

### 1. Five primary nav items, six in an overflow menu

Primary, rendered inline:

- `/benchmark` — the flagship product (see CONTEXT.md).
- `/communities`, `/events`, `/challenges`, `/launchpad` — the
  recurring action surfaces a returning member visits in a typical
  session.

Overflow, behind a "More ▾" DropdownMenu:

- `/jobs`, `/members`, `/blog`, `/investigations`, `/impact`,
  `/sponsors`.

**Why:** eleven equally-weighted top-level destinations is a
symptom of unmade IA decisions, not a constraint. Picking five
winners is the actual fix; the overflow menu is the layout
mechanism that lets the rest stay one click away without
re-creating the crowding problem the next time a page is added.

**How to apply:** new destinations default to overflow unless they
clear the bar that `/benchmark`, `/communities`, `/events`,
`/challenges`, `/launchpad` cleared — recurring action surfaces, or
flagship products. Editorial, directory, and about-the-org pages go
into overflow.

### 2. Hamburger Sheet stays until `lg` (1024px)

Below `lg`: the existing right-side `Sheet` is the only nav. The
inline `md`–`lg` middle state is removed.

The Sheet's contents mirror the desktop hierarchy: primary five,
divider, overflow six, then the auth-gated tail (Dashboard, My
Agent, Sign Out / Join).

**Why:** even with primary trimmed to five, the right-hand cluster
still consumed the `md`–`lg` band. Moving the breakpoint to `lg`
removes that dead zone; the inline nav appears only where it has
room to breathe.

### 3. Right-hand auth-gated links collapse into an avatar menu

For signed-in users, `[D] DASHBOARD`, `[A] MY AGENT`, and Sign Out
move from inline buttons into a single avatar DropdownMenu.
`LanguageSwitcher` and `NotificationBell` stay inline. Anonymous
users keep the inline `[J] JOIN` button unchanged.

**Why:** the right-hand cluster was the other half of the
overflow problem. Solving the left side (primary + More) without
collapsing the right side leaves the header fragile at 1024–1100px.
The avatar menu is also the conventional home for per-user actions
(profile, settings) we will likely add later.

**How to apply:** global keyboard shortcuts (`D` → dashboard, `A` →
agent) keep working regardless of whether the link is rendered
inline — the `keydown` handler in `Navbar` is independent of
visibility. New per-user actions belong in the avatar menu, not
inline.

### 4. Overflow trigger reflects active route

When `pathname` matches any link inside "More ▾", the trigger
renders in the active text style. The overflow items themselves
omit the `[X]` shortcut prefix in the closed state and show it
inside the open menu.

**Why:** without the active-trigger style, a member on `/blog`
sees no active marker anywhere in the header and loses orientation.
The shortcut prefix is an aesthetic signature of the primary nav;
inside the dropdown it adds noise without information.

## Alternatives considered

- **Raise the hamburger breakpoint to `xl` (1280px) and keep all
  11 links inline above it.** Rejected: 1024–1279px is the most
  common laptop band; dropping back to a hamburger there feels
  like a regression and does not address the IA problem.
- **Container-driven progressive collapse with ResizeObserver,
  hiding items right-to-left.** Rejected: the most polished option
  but solves the symptom (overflow) without picking winners. The
  next page added re-creates the problem.
- **Reduce primary nav without an overflow menu** (move the six
  into footer / `/explore` hub only). Rejected: kills
  discoverability for `/jobs` and `/members` which are high-intent
  surfaces — overflow keeps them one click away.

## Consequences

- Adding a new top-level destination is now a real IA decision,
  not a copy-paste of `navLinks`. Default placement is overflow.
- The `navLinks` array gains a `primary: boolean` field (or
  splits into two arrays) — the source of truth for the split
  lives in code, not in component logic.
- The global keyboard shortcut handler is unaffected; shortcuts
  remain visible-state-independent.
- Reversing this decision means re-inflating eleven destinations
  back to equal volume and reintroducing the `md`–`lg` dead zone.
  Possible, but disruptive once members have internalised the new
  IA.
