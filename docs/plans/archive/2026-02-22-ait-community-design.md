# AIT Community Platform — Design Document

**Date:** 2026-02-22
**Project:** AI Tech Community Netherlands
**Status:** Approved

## Vision

A community platform for technical innovators in the Netherlands, connecting engineers through knowledge exchange and collaboration. The platform showcases AI and automation through workshops, deep-dives, and hackathons. It is independent, practical, and community-driven, supporting young talent.

People join by attending events, becoming speakers, or partnering with the organization.

## Architecture

**Approach:** Monolithic Full-Stack (Next.js 15 App Router)

Everything lives in a single Next.js application. Events, profiles, content, and forum are feature modules within the app. tRPC provides type-safe APIs, Drizzle ORM manages the database, and Better Auth handles authentication.

This approach prioritizes MVP speed. Services can be extracted later if the community outgrows the monolith.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.8 |
| UI | shadcn/ui + Tailwind CSS 4 |
| API | tRPC 11 + React Query 5 |
| Auth | Better Auth (email/password + GitHub OAuth) |
| Database | SQLite via Turso/LibSQL |
| ORM | Drizzle ORM |
| i18n | next-intl (URL-based: /en, /nl) |
| Animation | Framer Motion |
| Forms | React Hook Form + Zod |
| Email | Resend (transactional) |
| Uploads | Uploadthing |

## Visual Direction

**Style:** Monochromatic + warm orange/amber accent

- Base palette: black, white, zinc/neutral gray scale (shadcn/ui defaults)
- Accent: warm orange/amber — Dutch identity, innovation, energy
- Used sparingly for CTAs, highlights, and key interactive elements
- Typography-driven design with generous whitespace
- Inter or Geist font family; Geist Mono for code
- Smooth page transitions and micro-animations (Framer Motion)
- Photography in B&W or duotone with amber accent
- Subtle grain/texture overlays for depth

## Site Structure

```
/[locale]/                    → Landing page
/[locale]/events              → Events listing
/[locale]/events/[slug]       → Event detail + registration
/[locale]/blog                → Content hub
/[locale]/blog/[slug]         → Article detail
/[locale]/community           → Forum threads
/[locale]/community/[slug]    → Thread detail
/[locale]/members             → Member directory
/[locale]/members/[id]        → Public member profile
/[locale]/dashboard           → Authenticated member dashboard
/[locale]/auth/signin         → Sign in
/[locale]/auth/signup         → Sign up
```

Locale is `en` or `nl`. Middleware detects browser language and redirects on first visit.

## i18n Strategy

- `next-intl` with URL-based routing (`/en/events`, `/nl/evenementen`)
- Static content: JSON message files (`messages/en.json`, `messages/nl.json`)
- Dynamic content: bilingual database fields (`titleEn`, `titleNl`, `contentEn`, `contentNl`)
- Language switcher always visible in navigation (EN | NL toggle)

## Data Model

### events
- id (uuid, PK)
- slug (unique)
- titleEn, titleNl
- descriptionEn, descriptionNl
- type (workshop | hackathon | deep_dive | meetup)
- date, startTime, endTime
- location (address or "online")
- maxAttendees (nullable)
- imageUrl
- status (draft | published | cancelled | completed)
- createdAt, updatedAt

### event_registrations
- id (uuid, PK)
- eventId (FK → events)
- userId (FK → user)
- status (registered | waitlisted | cancelled | attended)
- registeredAt

### event_speakers (join table)
- eventId (FK → events)
- userId (FK → user)

### member_profiles
- userId (FK → user, unique, 1:1)
- displayName
- bio
- skills (json array)
- company
- linkedinUrl, githubUrl, websiteUrl
- avatarUrl
- isPublic (boolean)
- locale (en | nl)

### articles
- id (uuid, PK)
- slug (unique)
- titleEn, titleNl
- contentEn, contentNl (markdown)
- authorId (FK → user)
- type (article | tutorial | talk_recording)
- tags (json array)
- mediaUrl
- status (draft | published)
- publishedAt, createdAt, updatedAt

### forum_threads
- id (uuid, PK)
- slug (unique)
- title
- content (markdown)
- authorId (FK → user)
- category (general | question | showcase | job)
- tags (json array)
- isPinned, isLocked
- createdAt, updatedAt

### forum_replies
- id (uuid, PK)
- threadId (FK → forum_threads)
- authorId (FK → user)
- content (markdown)
- parentReplyId (nullable, nested replies)
- createdAt, updatedAt

## User Journeys

### 1. New Visitor → Member
1. Lands on landing page via search/social/referral
2. Sees mission, upcoming events, member testimonials
3. Clicks "Join the Community" CTA
4. Signs up (email/password or GitHub OAuth)
5. Fills out member profile (name, skills, bio, company)
6. Redirected to dashboard with upcoming events and suggested content

### 2. Member → Event Attendee
1. Browses /events — filterable by type, date, upcoming
2. Clicks event → sees detail (description, speakers, schedule, spots)
3. Clicks "Register" → confirmation on-screen + email
4. Event appears in dashboard "My Events"
5. Post-event: access recordings/slides, leave feedback

### 3. Member → Content Creator
1. From dashboard: "Write Article" or "Start Discussion"
2. Markdown editor, tag selection, bilingual content option
3. Published immediately, flaggable by community
4. Others can comment/reply and upvote

### 4. Visitor → Speaker/Partner
1. Landing page section: "Become a Speaker" / "Partner with Us"
2. Interest form (name, topic, company)
3. Admin reviews and follows up

## Design Kit Components

Built in `design-kit.pen` using shadcn/ui patterns:

1. **Navigation bar** — logo, links, EN|NL switcher, auth button
2. **Hero section** — large heading, subtext, CTA button
3. **Event card** — date badge, title, type tag, register button
4. **Member card** — avatar, name, skills badges
5. **Article card** — thumbnail, title, author, date
6. **Forum thread row** — title, category badge, reply count, last activity
7. **Button variants** — default, secondary, outline, ghost
8. **Input fields** — text, textarea, select, with labels
9. **Section header** — title + description + optional action
10. **Footer** — link columns, newsletter signup, social icons
11. **Badge/Tag** — for skills, event types, categories
12. **Avatar** — with fallback initials
13. **Dialog/Modal** — for confirmations and quick forms

## MVP Rollout Phases

1. **Phase 1:** Design Kit + Landing Page + Auth
2. **Phase 2:** Events system (CRUD, registration, listing)
3. **Phase 3:** Member profiles (directory, public profiles)
4. **Phase 4:** Content hub (articles, tutorials)
5. **Phase 5:** Community forum (threads, replies)
