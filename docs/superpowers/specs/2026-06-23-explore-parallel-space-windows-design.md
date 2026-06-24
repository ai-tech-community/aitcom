# Explore + Parallel Space Windows — Design (Slice 1)

**Date:** 2026-06-23
**Status:** Approved for planning
**Branch:** `feat/explore-parallel-windows`
**Related:** builds on the ASCII Discover work (PR #192, `feat/ascii-discover`); precedes a future Slice 2 (communities-in-windows).

## Summary

Rename the primary nav item **COMMUNITIES → EXPLORE** and recompose the existing
Discover page into a clean, Circle-style **two-zone card directory** with curated
**web-sourced** ASCII accents (no more hand-authored art). From that page, a public
**space opens as a floating window** running the full `RoomView` (header, members,
join/request-access, live chat). Multiple space windows can be open **in parallel**,
each minimizable to a taskbar, so a user can converse across several spaces at once.

The realtime path is already solved: `useInboxStream` is a module-level, ref-counted
**singleton** `EventSource`, so N parallel windows share one SSE connection and each
window's conversation auto-refetches on message events. This slice adds **no new
realtime infrastructure**.

## Goals

- Rename nav `COMMUNITIES → EXPLORE` (label only; route unchanged).
- Recompose Discover into a clean two-zone card grid (communities, then spaces).
- Replace hand-made ASCII with curated, web-sourced ASCII used as **accents only**.
- Open a public space as a floating `BuildingModal` window containing the full `RoomView`.
- Support **multiple parallel space windows** with focus, minimize/restore, close, and
  a minimized-window taskbar — reusing the proven singleton SSE.

## Non-Goals (Slice 1)

- **Communities-in-windows** (lobby/feed in a window) — that is Slice 2.
- Full-text search — discovery search stays `ilike` as today.
- Presence / resident-agent badges on cards or windows.
- **Mobile windowing** — on mobile, a space card navigates to the full space page.
- Any change to the SSE / ADR-0025 realtime architecture.
- Forking or rewriting `RoomView` (we render it as-is).

## Current State (what we build on)

| Concern | Where | Notes |
| --- | --- | --- |
| Nav links | `src/components/navbar.tsx` (`navLinks` array, ~L31-50) | Label via `t(link.key)`; `nav.explore` already exists in `messages/en.json`. |
| Discover page | `src/components/communities/communities-directory.tsx` + `src/components/communities/discover/*` | Hero+search, communities (facets: trending/newest/largest), spaces (infinite scroll). Routes: page at `/communities`; `/discover` redirects in. |
| ASCII art | `src/components/communities/discover/ascii-art.ts` | `TOWN_SQUARE_BANNER`, `QUIET_SQUARE` — hand-made, to be replaced with curated web art. |
| Window shell | `src/components/community/building-modal.tsx` (`BuildingModal`) | Draggable, resizable, minimize/maximize/close, cascade offset via `windowIndex`, z-order via module-level `topZ` (40-49). Accepts arbitrary `children`. Mobile → fullscreen. |
| Parallel-chat precedent | `src/components/inbox/inbox-provider.tsx` (`InboxProvider`, global in `src/app/[locale]/layout.tsx`) | `openChats: string[]` + `minimizedChats` + overflow→minimize. Breakpoint-aware caps (2 desktop / 1 tablet / 0 mobile). Pattern to mirror. |
| Space view | `src/components/communities/rooms/room-view.tsx` (`RoomView`) | Loosely route-coupled: needs `slug` + `spaceSlug`; fetches via `api.spaces.getRoom`; renders header + members + join/request-access + embedded `ConversationView`. |
| Chat view | `src/components/messages/*` (`ConversationView`) | Shared between DMs and rooms; has `hideHeader`. |
| Realtime | `src/components/inbox/use-inbox-stream.ts` (`useInboxStream`) | **Singleton, ref-counted** `EventSource('/api/inbox/stream')`; invalidates `inbox.getMessages` per `conversationId`, plus `listConversations` / `totalUnreadCount`. No-op behind chat flag / SSR. |

## Design

### 1. Nav rename

In `src/components/navbar.tsx`, change the primary link `key: "communities"` → `"explore"`.
`href` stays `/communities`. `nav.explore` already exists in `messages/en.json` (verify all
locale message files have it; add where missing). Pure label change — no routing change.

### 2. Explore page — two-zone card directory

Recompose the existing Discover components (keep the tRPC data layer untouched):

- **Hero + search** — `town-square-hero.tsx`: keep the search input; replace the hand-made
  banner with a curated, web-sourced ASCII accent.
- **Communities zone** — `discover-communities.tsx`: keep facets (trending / newest /
  largest) and search wiring. Convert `community-row.tsx` from a row into a **card** in a
  responsive grid. A community card **navigates** to its lobby (`/communities/[slug]`) —
  windowing communities is Slice 2.
- **Spaces zone** — `discover-spaces.tsx`: keep infinite scroll. Convert `space-row.tsx`
  into a **card**. A space card **opens a window** (Section 3) on desktop, or **navigates**
  to `/communities/[slug]/spaces/[spaceSlug]` on mobile.
- **ASCII as accents only** — section headers, empty states (`QUIET_SQUARE`), and window
  chrome. All curated from the web; none hand-authored. See Section 5.

Design-system bar (CLAUDE.md / DESIGN.md): One Voice (Signal Orange only on the single
active state), No-Cream, House Kicker (`SectionLabel` `/ LABEL`), Mono-Is-Machine,
Flat-By-Default. Cards are border-defined and flat. An `impeccable` pass closes the slice.

### 3. Space window system — `SpaceWindowProvider`

A new client provider, modeled directly on `InboxProvider`, mounted globally in
`src/app/[locale]/layout.tsx` (sibling to `InboxProvider`).

**State**
- `openWindows: SpaceWindowRef[]` and `minimizedWindows: SpaceWindowRef[]`, where
  `SpaceWindowRef = { communitySlug: string; spaceSlug: string }`.
- Identity key = `${communitySlug}/${spaceSlug}`. Opening an already-open or already-minimized
  space **focuses/restores** the existing window — never duplicates.
- Z-order reuses `BuildingModal`'s existing module-level `topZ` (no new z-index system).

**Actions** (mirror `InboxProvider`): `openSpace(ref)`, `closeSpace(key)`,
`minimizeSpace(key)`, `restoreSpace(key)`, `focusSpace(key)`.

**Capacity / overflow**
- Desktop: **max 3 open** windows (cascade-offset via `windowIndex`). Opening a 4th
  auto-minimizes the oldest to the taskbar — same overflow logic `InboxProvider` uses at 2.
- Tablet: max 1 open (others minimized).
- Mobile: **0** — `openSpace` instead routes to the full space page (no windows on mobile).

**Rendering**
- A root component (e.g. `SpaceWindowRoot`) maps `openWindows` → one `BuildingModal` each:
  - `title` = space name, `subtitle` = parent community name, `windowIndex` = position
    (cascade), `onClose`/minimize wired to provider actions.
  - `children` = **full `RoomView`** given `slug` + `spaceSlug` (rendered as-is, including its
    own header, members panel, and join/request-access gates).
- `minimizedWindows` → a **taskbar** of pills (visual pattern borrowed from
  `chat-window-minimized.tsx`, ASCII-accented); clicking a pill restores the window.

**Realtime**
- Each open window mounts the singleton `useInboxStream` (directly, or via `RoomView` /
  `ConversationView` — confirm during implementation that the chat surface inside a window
  mounts it; add the hook at the window root if not). All windows share one `EventSource`;
  a message in any open space invalidates that conversation's cache and the window refetches.

**Known minor (deferred to `impeccable` polish, not this slice)**
- `BuildingModal` titlebar + `RoomView`'s own header are slightly redundant. Accepted for
  Slice 1 (user chose "full RoomView"); refine later rather than fork `RoomView` now.

### 4. Wiring the trigger

Space cards (`space-row.tsx` → card) call `useSpaceWindows().openSpace({ communitySlug,
spaceSlug })` on desktop/tablet, and `router.push(...)` on mobile (breakpoint from the
provider, mirroring `InboxProvider`). The card needs the parent community slug available
(confirm `spaces.discoverPublic` returns it; if not, surface it — it is required for both
the window route and the `RoomView` props).

### 5. ASCII art — web-sourced, curated

Replace hand-authored art in `ascii-art.ts` with a small curated set sourced from the web
during implementation (e.g. ASCII art archives), used only as accents (hero, empty states,
window chrome / taskbar). Curation requirements:
- Each piece is legible at the rendered size and reads as intended (the prior town-square
  banner originally mis-read as a cat — verify each figure with a human-eye check).
- Record the source URL for each piece in a comment for attribution; prefer
  public-domain / freely-usable art.
- Keep them in `ascii-art.ts` (or a sibling) so the motif stays swappable, matching the
  existing "isolated ASCII" convention.

## Components & Files

**New**
- `src/components/communities/explore/space-window-provider.tsx` — provider + `useSpaceWindows` hook (reducer logic).
- `src/components/communities/explore/space-window-root.tsx` — renders open `BuildingModal`s + minimized taskbar.
- (optional) `src/components/communities/explore/space-window.tsx` — single `BuildingModal` + `RoomView` wrapper if it keeps `space-window-root` small.

**Modified**
- `src/components/navbar.tsx` — nav key rename.
- `src/app/[locale]/layout.tsx` — mount `SpaceWindowProvider` + `SpaceWindowRoot`.
- `src/components/communities/discover/community-row.tsx` → card.
- `src/components/communities/discover/space-row.tsx` → card + open-window trigger.
- `src/components/communities/discover/discover-communities.tsx` / `discover-spaces.tsx` → grid layout.
- `src/components/communities/discover/town-square-hero.tsx` — curated ASCII.
- `src/components/communities/discover/ascii-art.ts` — curated web-sourced art.
- `messages/*.json` — ensure `nav.explore` exists across locales.

**Reused as-is**
- `BuildingModal`, `RoomView`, `ConversationView`, `useInboxStream`, the communities/spaces tRPC routers.

## Data Flow

```
Explore page (cards)
  community card → router.push(/communities/[slug])            (Slice 1)
  space card     → desktop/tablet: useSpaceWindows().openSpace({communitySlug, spaceSlug})
                   mobile:         router.push(/communities/[slug]/spaces/[spaceSlug])

SpaceWindowProvider (global)
  openWindows[] → SpaceWindowRoot → BuildingModal × N → RoomView(slug, spaceSlug)
                                                          → ConversationView (chat)
  minimizedWindows[] → taskbar pills → restore

RoomView/window mounts useInboxStream (singleton EventSource)
  message event → invalidate inbox.getMessages({conversationId}) → window refetches
```

## Error / Edge Handling

- **Dedup:** opening an already-open/minimized space focuses/restores; never duplicates.
- **Overflow:** opening beyond the desktop cap auto-minimizes the oldest window.
- **Membership:** handled inside `RoomView` (public → join CTA; private → request access;
  composer gated until joined) — no new logic in the window layer.
- **Mobile:** no windows; navigate to the space page instead.
- **Missing community slug** on a space card → fall back to navigation (cannot open a window
  without both slugs); log so the data gap is visible.
- **Chat flag off / SSR:** `useInboxStream` is already a no-op; windows still render
  (chat may be inert), matching current behavior.

## Testing

- **Reducer unit tests** (pure): open / focus-existing / minimize / restore / close;
  dedup by composite key; overflow→minimize at the desktop cap; breakpoint transitions
  moving overflow to minimized (mirror the existing `InboxProvider` overflow expectations).
- **Smoke test:** a space card opens exactly one window; re-clicking the same card focuses
  the existing window rather than opening a second.
- **Mobile branch:** `openSpace` on the mobile breakpoint navigates instead of opening a window.
- **Discover cards:** keep/extend existing Discover tests for the row→card restyle (names,
  member counts, links, empty states).
- `tsc` + lint clean; full suite green (DB-gated suites remain skipped unless run locally).

## Open Questions / Defaults Chosen

- **Max desktop windows = 3** (chosen). Revisit if it feels cramped.
- **Full `RoomView` header kept** inside the window (chosen); titlebar redundancy deferred to polish.
- Confirm `spaces.discoverPublic` exposes the parent community slug for the card → window props.
- Confirm the chat surface inside a windowed `RoomView` mounts `useInboxStream` (add at window root if not).

## Follow-ons (not this slice)

- **Slice 2:** communities open in `BuildingModal` windows (lobby/feed), spaces poppable from
  inside them; Explore becomes the "desktop."
- `impeccable` polish pass on cards + window chrome + taskbar.
- Possible consolidation of the two window managers (inbox chat windows + space windows)
  once both are in use.
