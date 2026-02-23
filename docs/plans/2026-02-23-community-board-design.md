# AIT Community Board — Design Document

**Date:** 2026-02-23
**Project:** AI Tech Community Netherlands
**Status:** Approved

---

## Vision

The `/community` page is an interactive isometric village board — not a traditional list/forum page. Visitors see a full-viewport dark canvas with four CSS isometric "buildings" scattered across it, each representing a different aspect of community participation. Clicking a building opens a Framer Motion modal with full interactive content.

Inspired visually by PostHog's desktop board UI, adapted to AIT's monochromatic + orange brand.

---

## Visual Design

### Page Layout

- Full-viewport canvas (`min-h-screen`), no traditional content columns
- Background: `bg-zinc-950` base
- Subtle CSS grid pattern overlay: `1px` lines every `40px` in `zinc-800` (graph paper feel)
- Two orange radial glow blobs: `bg-orange-500/5`, one bottom-left, one top-right
- SVG `feTurbulence` grain overlay via CSS `background-image` (pointer-events: none)
- Minimal header: monospace breadcrumb `/ COMMUNITY` at top-left

### Responsive Layout

- **Desktop (≥ `md`):** Buildings scattered with absolute positioning in a relative container
- **Mobile (< `md`):** 2×2 CSS grid, centered, full-width buildings

---

## The Four Buildings

Each building is a React component with three CSS faces (top, left, right) using `transform` to create the isometric illusion. Framer Motion handles:
- **Hover:** `y: -6px` float + intensified box-shadow
- **Click:** brief scale pulse, then modal opens

| Building | Nickname | Icon (Lucide) | Size | Accent |
|---|---|---|---|---|
| Community Rules | "The Constitution" | `Scale` | Small | zinc |
| Ideas & Voting | "Town Hall" | `Lightbulb` | Large | orange |
| Discussion Threads | "The Forum" | `MessageSquare` | Medium | zinc |
| Contribute / Get Involved | "The Workshop" | `Wrench` | Medium | zinc |

"Town Hall" is the largest building — visually the centrepiece. Buildings have a subtle orange window-glow `box-shadow` on hover.

---

## Modal Design

All modals share a common shell:
- Dark backdrop (`bg-black/60`)
- `bg-zinc-900 border border-zinc-800` panel, `max-w-2xl`, `rounded-xl`
- Orange title accent (dot or left-border)
- Close button top-right
- Framer Motion: spring enter (`type: "spring", stiffness: 300, damping: 30`), opacity fade exit

### Modal 1 — Community Rules ("The Constitution")

- Content fetched from **Payload CMS Global** `CommunityRules`
- Rendered with `LexicalRenderer` (existing component from blog)
- Admins edit rules at `/admin` — no code deploy needed for rule updates
- Public access (no auth required)

### Modal 2 — Ideas & Voting ("Town Hall")

- Tabbed toggle: **Most Voted** | **Recent**
- Idea rows: title, description (truncated), vote count, upvote button
  - Upvote button: filled orange if already voted, outline if not, disabled with tooltip if logged out
- "Submit Idea" form at bottom (members only):
  - Title (required, max 100 chars)
  - Description (optional, max 500 chars)
  - Submit → optimistic update
- Status badges on ideas: `open` (default) | `implemented` (green) | `rejected` (muted)

### Modal 3 — Discussion Threads ("The Forum")

- Category tabs: **All** | **General** | **Questions** | **Showcase** | **Jobs**
- Thread rows: avatar, title, reply count, last activity timestamp, category badge
- "New Thread" button → secondary slide-in form (title, content, category)
- Thread detail: clicking a thread navigates to `/[locale]/community/[slug]` (full page, outside the board)
- Members only to create; public to read

### Modal 4 — Contribute / Get Involved ("The Workshop")

- Static content (no database)
- Four contribution cards:
  1. **Speak at an event** — description + "Express Interest" link (to speaker form)
  2. **Write an article** — description + "Go to Dashboard" link
  3. **Mentor a member** — description + "Coming Soon" badge
  4. **Partner / Sponsor** — description + "Get in Touch" link

---

## Data Model

### New Payload Global

```
CommunityRules (Payload Global)
  - content: richText (Lexical editor)
  - updatedAt: auto
```

Registered in `payload.config.ts` under `globals`.

### New Drizzle Tables

```sql
community_ideas
  id          TEXT PRIMARY KEY (uuid)
  title       TEXT NOT NULL (max 100)
  description TEXT (max 500, nullable)
  author_id   TEXT NOT NULL REFERENCES user(id)
  status      TEXT NOT NULL DEFAULT 'open' -- open | implemented | rejected
  created_at  INTEGER NOT NULL

idea_votes
  idea_id   TEXT NOT NULL REFERENCES community_ideas(id)
  user_id   TEXT NOT NULL REFERENCES user(id)
  PRIMARY KEY (idea_id, user_id)   -- prevents double-voting
```

### Existing Tables Used (Phase 5, built in this phase)

```
forum_threads  (from original design doc)
forum_replies  (from original design doc)
```

---

## tRPC Router — `community`

All routes under `src/server/trpc/routers/community.ts`:

| Procedure | Type | Auth | Description |
|---|---|---|---|
| `ideas.list` | query | public | Paginated ideas, sorted by votes or createdAt |
| `ideas.submit` | mutation | required | Create new idea |
| `ideas.toggleVote` | mutation | required | Insert or delete from `idea_votes` |
| `threads.list` | query | public | List threads, filter by category |
| `threads.create` | mutation | required | Create new thread |
| `rules.get` | query | public | Fetch Payload `CommunityRules` global |

---

## Component Architecture

```
/[locale]/community
└─ page.tsx (Server Component — minimal, wraps CommunityBoard)
   └─ CommunityBoard (Client Component)
        ├─ IsometricBackground (CSS-only, no JS)
        ├─ BuildingCard × 4 (Framer Motion)
        │    └─ IsometricBuilding (CSS faces: top / left / right)
        └─ BuildingModal (Framer Motion, React Portal)
             ├─ RulesModal (fetches via tRPC rules.get)
             ├─ IdeasModal
             │    ├─ IdeaList (sorted/filtered)
             │    ├─ VoteButton (optimistic)
             │    └─ IdeaForm (members only)
             ├─ ThreadsModal
             │    ├─ ThreadList (category filtered)
             │    └─ NewThreadForm (members only)
             └─ ContributeModal (static)
```

---

## Route Structure

```
/[locale]/community          → the board page (this feature)
/[locale]/community/[slug]   → thread detail page (full page, separate task)
```

---

## Animations Summary

| Interaction | Animation |
|---|---|
| Page load | Buildings stagger in from below (Framer Motion `staggerChildren`, `y: 40 → 0`) |
| Building hover | Float up `y: -6`, orange box-shadow intensifies |
| Building click | Scale pulse `1 → 0.95 → 1`, modal opens |
| Modal enter | Spring `stiffness: 300, damping: 30`, `scale: 0.95 → 1`, `opacity: 0 → 1` |
| Modal exit | `opacity: 1 → 0`, `scale: 1 → 0.95`, 150ms |
| Vote button | Optimistic immediate fill + count increment |

---

## MVP Scope (this phase)

- [x] Community board page with 4 buildings
- [x] Community Rules modal (Payload Global)
- [x] Ideas & Voting modal (submit + vote)
- [x] Discussion Threads modal (list + create thread)
- [x] Contribute modal (static)
- [x] Thread detail page (`/community/[slug]`)
- [ ] Thread reply threading (defer to next phase)
- [ ] Idea comment threads (defer)
- [ ] Notification system for replies (defer)
