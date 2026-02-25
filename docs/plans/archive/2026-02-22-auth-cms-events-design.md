# Auth Completion, CMS Integration & Events System — Design Document

**Date:** 2026-02-22
**Project:** AI Tech Community Netherlands
**Status:** Approved
**Scope:** Auth completion, SQLite→Neon migration, Payload CMS integration, Events system (Phase 2)

## Architecture

Two-system split within a single Next.js application sharing one Neon Postgres database.

**Payload CMS** handles admin-facing content management:
- Events, Articles, Speakers, Pages, Media as Payload collections
- Media library with image uploads, cropping, reuse
- Drafts, versioning, scheduled publishing
- Side-by-side EN/NL localized editing
- Admin panel at `/admin` with Payload's own auth (separate from member auth)

**Existing stack** handles member-facing features:
- Better Auth — member sign-in/sign-up (email + GitHub OAuth)
- tRPC — event registration, forum posts, profile updates
- Drizzle ORM — member profiles, registrations, forum threads/replies

```
┌─────────────────────────────────────────────────┐
│                  Next.js App                     │
│                                                  │
│  ┌──────────────┐       ┌─────────────────────┐ │
│  │  Payload CMS │       │   Your Stack        │ │
│  │  /admin      │       │   Better Auth       │ │
│  │  db-postgres │       │   tRPC + Drizzle    │ │
│  │              │       │   (neon-serverless)  │ │
│  │  Events      │       │                     │ │
│  │  Articles    │       │   Registration      │ │
│  │  Pages       │       │   Profiles          │ │
│  │  Media       │       │   Forum             │ │
│  └──────┬───────┘       └──────────┬──────────┘ │
│         └──────────┬───────────────┘             │
│              ┌─────┴─────┐                       │
│              │   Neon    │                       │
│              │ Postgres  │                       │
│              └───────────┘                       │
└─────────────────────────────────────────────────┘
```

## Database Migration (SQLite → Neon Postgres)

- Replace `@libsql/client` with `@neondatabase/serverless`
- Replace Drizzle SQLite schema definitions with PostgreSQL equivalents
- Update `drizzle.config.ts` to `dialect: "postgresql"`
- Update `DATABASE_URL` env var to Neon connection string
- Push Better Auth schema (user, account, session, verification) to Neon

## Auth Completion

The auth infrastructure exists (Better Auth config, GitHub OAuth provider, API route handler, tRPC protected procedures). The following needs to be wired up:

### Sign-in / Sign-up Forms
- Wire forms to `authClient.signIn.email()` and `authClient.signUp.email()`
- Wire GitHub OAuth button to `authClient.signIn.social({ provider: "github" })`
- Add form validation with Zod (email format, password min length)
- Add error states with Sonner toasts
- Redirect to `/dashboard` on success

### Navbar Auth State
- Use `authClient.useSession()` to detect logged-in user
- Logged out: show `[J] JOIN` button (current behavior)
- Logged in: show user avatar/name + dropdown (Dashboard, Profile, Sign Out)

### Route Protection
- Middleware check: `/dashboard/*`, `/community/new` require auth
- Redirect unauthenticated users to `/auth/signin?redirect=<original-path>`
- `/admin/*` handled by Payload's own auth separately

### Sign Out
- `authClient.signOut()` → redirect to landing page

No email verification for MVP.

## Payload CMS Collections

### Events
- title (localized EN/NL)
- slug (unique)
- description (rich text, localized)
- type (workshop | hackathon | deep_dive | meetup)
- date, startTime, endTime
- location (address or "online")
- maxAttendees (nullable)
- image (relation to Media)
- status (draft | published | cancelled | completed)
- speakers (many-to-many relation to Speakers)
- Features: drafts, versioning, scheduled publish, EN/NL localization

### Articles
- title (localized EN/NL)
- slug (unique)
- content (rich text/markdown, localized)
- type (article | tutorial | talk_recording)
- tags (array)
- mediaUrl
- status (draft | published)
- publishedAt
- Features: drafts, versioning, EN/NL localization

### Speakers
- name
- bio (localized)
- company
- photo (relation to Media)
- linkedinUrl, githubUrl
- Reusable across events via relationship field

### Pages
- title (localized EN/NL)
- slug (unique)
- content (rich text, localized)
- Layout blocks
- For static pages (about, partner-with-us, etc.)

### Media
- Payload built-in upload collection
- Image uploads, cropping, auto-resizing

## Drizzle Schema (Member-facing)

Managed by Drizzle ORM, not Payload:

### member_profiles
- userId (FK → user, unique, 1:1)
- displayName, bio, skills (json), company
- linkedinUrl, githubUrl, websiteUrl
- avatarUrl, isPublic, locale

### event_registrations
- id (uuid, PK)
- eventId (references Payload event ID)
- userId (FK → user)
- status (registered | waitlisted | cancelled | attended)
- registeredAt

### forum_threads (Phase 5, schema defined now)
- id, slug, title, content, authorId, category, tags, isPinned, isLocked

### forum_replies (Phase 5, schema defined now)
- id, threadId, authorId, content, parentReplyId

## Events System (Phase 2)

### Public Pages
- `/events` — listing page, filterable by type and date
- `/events/[slug]` — detail page with description, speakers, schedule, registration

### Event Registration Flow
1. Authenticated user clicks "Register" on event detail page
2. tRPC protected procedure checks `maxAttendees` vs current registration count
3. If spots available → status `registered`, if full → status `waitlisted`
4. Confirmation shown on-screen via Sonner toast
5. Event appears in member dashboard under "My Events"
6. Cancel registration available from dashboard

### Data Flow
- Event content: read from Payload's events table via Drizzle (standard Postgres tables)
- Registration: tRPC mutation → `event_registrations` table
- Dashboard: tRPC query joins `event_registrations` with Payload event data

## Not In Scope
- Member profiles / directory (Phase 3)
- Articles / content hub frontend (Phase 4 — Payload collections ready, frontend later)
- Forum (Phase 5 — schema defined now, UI later)
- Email verification
- Transactional emails via Resend
