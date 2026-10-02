# Member dashboard as Home — design

**Date:** 2026-10-02
**Status:** proposed
**Evidence:** `.impeccable/critique/2026-10-02T07-11-53Z__src-app-locale-dashboard-member.md` (UX critique, 19/40)

## Goal

A member who opens `/dashboard` sees, without scrolling, what is next for
them and what is happening in their communities. Their own progress (level,
XP, streak) stays visible but small and always in the same place.

Today the dashboard answers "here is your score". The first tab is called
"Feed" but stacks eight widgets — boost, profile, checklist, a large streak
card, a points chart, challenges, personal activity, suggestions — and the
real next actions sit below the fold. Each tab uses its own header, empty
state, loading style, filter control, width and container shape, so the five
tabs read as five products. Tab names collide with the global nav: top-nav
**Events** and **Jobs** are the public listings, dashboard **Events** and
**Jobs** mean "mine".

## Decisions

| Topic | Decision |
|---|---|
| Job of the page | **Home:** next actions first, then community activity, then people to meet |
| Layout | Full width (aligned with the top nav's edges); main column plus a 20rem side panel; panel sticky on `lg`, stacked below main on smaller screens |
| Side panel | Shown on **every** tab, same content, so profile and progress always live in one place |
| Tabs | Home · My communities · My events · Job tracker · Notifications · Settings |
| Quick links row | Removed. Notifications becomes a tab; Onboarding is reached from the "Get started" card |
| Streak calendar, points chart, awards | Collapsed into the "You" card; "See your progress" expands them in place. No new page or tab |
| Boost | One line inside the "You" card while active. It is the only orange element in the panel |
| Section chrome | One shared `DashboardSection` used by every tab |
| Mentions in Next up | Out of scope: no `mention` notification type exists (`notification.type`, `src/server/db/schema.ts:553`). They surface as unread notifications |

## Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ Hi, <name>                                                          │
│ Home · My communities · My events · Job tracker · Notifications · ⚙ │
├───────────────────────────────────────────┬─────────────────────────┤
│ <main> (per tab)                          │ <aside> (every tab)     │
│                                           │ / YOU                   │
│ Home:                                     │   avatar, name, level   │
│   / NEXT UP                               │   XP <Progress>         │
│   / FROM YOUR COMMUNITIES                 │   streak (compact)      │
│                                           │   boost line (if live)  │
│                                           │   See your progress ▸   │
│                                           │ / GET STARTED           │
│                                           │   (until complete)      │
│                                           │ / PEOPLE TO MEET        │
└───────────────────────────────────────────┴─────────────────────────┘
```

### Pattern and boundaries

- **Layout owns the frame.** `dashboard/(member)/layout.tsx` renders the
  greeting, the tabs, and the grid with `<main>` = `children` and
  `<aside>` = `DashboardSidePanel`. Pages render only their main column, so a
  tab cannot drift from the frame. Grid follows the existing event page
  pattern: `grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]`
  (`src/app/[locale]/events/[slug]/page.tsx:324`).
- **Tabs** use the existing `RouteTabs` primitive (`src/components/ui/route-tabs.tsx`),
  which already sets `aria-current="page"`. `src/components/dashboard-tabs.tsx`
  is deleted. Home uses `match: "exact"`.
- **`DashboardSection`** (`src/components/dashboard/dashboard-section.tsx`):
  a `SectionLabel` heading (rendered as `h2`), an optional action slot, and a
  body that takes a query-like state and renders `Skeleton`, `ErrorState`
  (with retry), `EmptyState`, or children. It is the one place that decides
  how a dashboard section loads, fails, and is empty. Every tab migrates to it.
- **Side panel cards** are independent client components, each owning its
  own query and states through `DashboardSection`: `YouCard` (replaces
  `DashboardProfile`, `StreakWidget`, `PointsWidget`, `BoostWidget` on the
  dashboard), `GetStartedCard` (wraps the existing onboarding checklist),
  `PeopleToMeet` (wraps `onboarding.getSuggestions`).
- **Next up** is one server read model, not a client-side join of six
  queries: a new `home.nextUp` protected procedure returns a typed list of
  items, each a discriminated union (`event`, `challenge`, `invite`,
  `joinRequests`, `unread`). One loader per kind lives in
  `src/server/home/next-up/`, and the router concatenates and orders them.
  A new kind of next action is a new loader, not a new special case in the
  UI. The client renders each kind through one row component keyed on `kind`.

### Next up sources

| Kind | Source |
|---|---|
| `event` | My registrations (not cancelled / payment failed) for events starting from now, next 3 — same rules as `splitMyEvents` (`src/components/events/my-events/split-my-events.ts`) |
| `challenge` | `challengeEnrollments` with `status = active` joined to the challenge (today done client-side in `active-challenges-widget.tsx`) |
| `invite` | `getMyCommunities` rows with `status = invited` |
| `joinRequests` | Count of `pending_approval` members per community where I am an admin |
| `unread` | `notifications.unreadCount` and `inbox.totalUnreadCount` |

Empty Next up shows one warm line and a single link to explore communities
or events — not an empty box.

### From your communities

Home's activity section shows activity **from communities I am an active
member of**. No procedure does this today: `feed.getFeed` and
`feed.getActivity` take one `communitySlug`. A new
`feed.getHomeActivity` reuses `loadCommunityActivity`
(`src/server/communities/activity-feed.ts`) across my active memberships,
with the same visibility rules as the per-community feed.

**Defect to fix in the same slice:** `activity.getFeed` with
`mode: "community"` applies no filter (`src/server/api/routers/activity.ts:27-41`)
and returns every `activity_event` row on the platform, including rows with a
`communityId` or `recipientId`. The slice must check what those rows expose
in the current UI, remove the unscoped mode, and keep only `personal`.

## Tab-by-tab

| Tab | Change |
|---|---|
| Home | Next up + From your communities |
| My communities | `DashboardSection`; error branch (today an error reads as "not a member"); no nested link (Manage inside the row link); `h2` headings; organizer rows show pending join requests |
| My events | `DashboardSection`; filter pills replaced by `SegmentedControl` |
| Job tracker | Already the model; wrap in `DashboardSection`; replace raw `error.message` with `ErrorState` |
| Notifications | Moves into the tab bar; preferences move to Settings; row actions visible on focus (`focus-within`), not hover only; "Clear all" goes through `ConfirmProvider`; `RelativeTime` for dates |
| Settings | `DashboardSection`; gains notification preferences |
| Onboarding | Stays a route (linked from Get started), not a tab; single `h1` |

## Rules applied

- **One Voice:** one orange element per screen — the most important Next up
  action, or the live boost. The XP bar uses `<Progress>` (neutral fill).
- **Status colour is for status:** the streak flame is not `text-success`.
- **Mono-Is-Machine:** human labels (badge names, skills, company, button
  text) move to Geist Sans; mono stays for stats, levels, timestamps, kickers.
- **i18n:** every string on the dashboard comes from `messages/{en,nl}.json`,
  including the greeting, activity verbs and notification actions. Kickers
  are written in sentence case in messages and uppercased by CSS.
- **Accessibility:** one `h1` per page, `h2` per section, progressbar
  semantics on XP, `aria-pressed` on onboarding choices, visible focus.

## Slices

Each slice is one PR and leaves the dashboard working.

1. **Frame** — layout grid, `RouteTabs` with the new names and the
   Notifications tab, Quick links removed, translated greeting,
   `DashboardSection`, side panel (`YouCard` with in-place progress,
   `GetStartedCard`, `PeopleToMeet`). Home main keeps challenges and personal
   activity until slices 2–3.
2. **Next up** — `home.nextUp` read model with per-kind loaders and tests;
   Home renders it.
3. **From your communities** — `feed.getHomeActivity`; remove the unscoped
   `activity.getFeed` community mode.
4. **Tabs onto the frame** — My communities, My events, Job tracker,
   Notifications, Settings migrate to `DashboardSection`; error states,
   i18n, accessibility items above.
5. **Colour and type** — One Voice, status colours, mono vs sans, dashed
   borders only where DESIGN.md sanctions them.

## Rejected

- **Keep "Feed" and reorder widgets.** Leaves the name wrong and the frame
  inconsistent; fixes order, not structure.
- **A separate Progress tab.** Adds a seventh tab for content the member
  checks occasionally; in-place expansion keeps it one click away.
- **Side panel on Home only.** Width varies between tabs and profile moves
  around — the inconsistency this design removes.
- **Client-side Next up from six existing queries.** Six round trips, ordering
  logic in the browser, and a new action kind means editing the component.
- **"Mine" filters on the public Events and Jobs pages instead of tabs.**
  Worth revisiting later; it changes public pages and is larger than this
  redesign needs.
