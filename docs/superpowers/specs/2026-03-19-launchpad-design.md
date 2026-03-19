# Launchpad — Design Spec

A new section within the AIT Community platform where entrepreneurs can share their ideas and prototypes, track their journey from concept to launch, and get feedback from the community.

## Problem

Entrepreneurs follow a cycle: idea, prototype, validate, scale. The validation step lacks a good community-driven space where people can share early-stage work and get real feedback. Launchpad fills this gap within the AIT Community.

## Core Concept

- Entrepreneurs post **projects** at any stage (idea, prototype, MVP, launched)
- Each project has an **editable main pitch** (stays current) and a **timeline of updates** (shows the journey)
- Any AIT community member can **vote** and **comment** on projects
- Authors can include **external links** (demos, surveys, landing pages, GitHub repos) — the platform provides comments + voting as built-in feedback; structured feedback is left to external tools (Typeform, Google Forms, etc.)
- Project pages are **publicly visible** (no login required to view) to maximize exposure and attract new members
- All actions integrate with the existing **XP and gamification** system

## Approach

Extend existing patterns — Payload CMS collection for projects, Drizzle tables for dynamic data (updates, comments, votes), new tRPC router, new route group under `/launchpad`.

## Data Model

### Payload CMS Collection: `LaunchpadProjects`

| Field        | Type                                         | Notes                                        |
| ------------ | -------------------------------------------- | -------------------------------------------- |
| `title`      | text                                         | Project name                                 |
| `slug`       | text                                         | URL-friendly, auto-generated from title      |
| `pitch`      | rich text                                    | Editable main description                    |
| `stage`      | select: `idea`, `prototype`, `mvp`, `launched` | Current stage of the project                 |
| `tags`       | array of text                                | e.g., "AI", "SaaS", "Healthcare"             |
| `links`      | array of `{ label: text, url: text }`        | Demo, survey, landing page, GitHub, etc.     |
| `coverImage` | media (upload)                               | Optional cover/hero image                    |
| `author`     | relationship to user                         | Project creator                              |
| `status`     | select: `draft`, `published`, `archived`     | Visibility state                             |
| `createdAt`  | date                                         | Auto-managed                                 |
| `updatedAt`  | date                                         | Auto-managed                                 |

### Drizzle Tables (in `app` schema)

**`launchpad_update`** — Timeline entries posted by the project author.

| Column     | Type      | Notes                                  |
| ---------- | --------- | -------------------------------------- |
| `id`       | varchar(255) (pk) | Auto-generated via `crypto.randomUUID()` |
| `projectId`| integer          | References Payload LaunchpadProjects (auto-increment ID) |
| `authorId` | varchar(255)     | References user                        |
| `title`    | text             | Update headline                        |
| `content`  | text             | Update body                            |
| `createdAt`| timestamp        | Auto-managed                           |

**`launchpad_comment`** — Feedback comments, supporting threaded replies.

| Column     | Type                  | Notes                              |
| ---------- | --------------------- | ---------------------------------- |
| `id`       | varchar(255) (pk)     | Auto-generated via `crypto.randomUUID()` |
| `projectId`| integer               | References Payload LaunchpadProjects (auto-increment ID) |
| `authorId` | varchar(255)          | References user                    |
| `content`  | text                  | Comment body                       |
| `parentId` | varchar(255) (nullable)| Self-reference for threaded replies|
| `createdAt`| timestamp             | Auto-managed                       |

**`launchpad_vote`** — One vote per user per project.

| Column     | Type             | Notes                                  |
| ---------- | ---------------- | -------------------------------------- |
| `id`       | varchar(255) (pk)| Auto-generated via `crypto.randomUUID()` |
| `projectId`| integer          | References Payload LaunchpadProjects (auto-increment ID) |
| `voterId`  | varchar(255)     | References user                        |
| `createdAt`| timestamp        | Auto-managed                           |

Unique constraint on `(projectId, voterId)`.

## Pages & Routes

All routes under `/[locale]/launchpad`.

### `/launchpad` — Listing Page

- Grid/card view of all published projects
- Each card shows: cover image, title, stage badge, author, vote count, comment count, tags
- Sort by: newest, most voted, recently updated, trending (trending = votes received in the last 7 days, descending)
- Filter by: stage, tags
- Search by title/description
- "Submit Project" CTA button (links to `/launchpad/new`)

### `/launchpad/[slug]` — Project Detail Page

- **Header:** cover image, title, stage badge, author info with avatar, vote button + count, external links
- **Pitch section:** the editable rich text pitch
- **Timeline section:** chronological list of updates (newest first), each with title, content, and date
- **Comments section:** threaded discussion
- Author sees edit pitch / post update / manage buttons
- Non-authenticated users see a prompt to sign in to vote or comment

### `/launchpad/new` — Create Project (authenticated)

- Form fields: title, pitch (rich text editor), stage, tags, links, cover image
- Draft / publish toggle
- Preview before publishing

### `/launchpad/[slug]/edit` — Edit Project (author only)

- Edit the main pitch, stage, tags, links, cover image
- Cannot change slug after creation

### `/launchpad/[slug]/update` — Post Update (author only)

- Form: update title, update content
- Appended to the project timeline

## API (tRPC Router)

New router: `launchpad.ts`, registered alongside existing routers.

| Procedure                | Auth       | Description                                      |
| ------------------------ | ---------- | ------------------------------------------------ |
| `launchpad.list`         | Public     | Paginated listing with sort, filter, search       |
| `launchpad.getBySlug`    | Public     | Single project with updates, comments, vote count |
| `launchpad.create`       | Required   | Create new project                                |
| `launchpad.update`       | Author     | Edit project pitch/metadata                       |
| `launchpad.archive`      | Author     | Set status to archived                            |
| `launchpad.postUpdate`   | Author     | Add a timeline update                             |
| `launchpad.vote`         | Required   | Toggle vote (one per user per project)            |
| `launchpad.addComment`   | Required   | Post a comment or threaded reply                  |
| `launchpad.deleteComment`| Comment author or Admin| Remove a comment (comment author can delete their own; admins can delete any) |

## Navigation

- New "Launchpad" entry in the main navigation bar, alongside Forum, Challenges, Benchmark, etc.

## Internationalization

- New translation keys in both `en` and `nl` message files
- Covers: page titles, buttons, form labels, stage names, sort/filter labels, empty states, success/error messages

## Gamification

- **XP rewards** for: creating a project, posting an update, receiving a vote, leaving a comment
- Exact XP values configured alongside existing reward tiers
- **New badge:** "First Launch" — awarded when a member publishes their first project
- All actions logged to `activity_event` using the existing activity tracking system

## Notifications

- Project author notified when someone:
  - Votes on their project
  - Comments on their project
  - Replies to a comment thread on their project
- Uses the existing notification system

## SEO & Public Visibility

- Listing and detail pages are publicly accessible (no auth required to view)
- Proper meta tags: title, description, OG image (from cover image)
- Good for discoverability and attracting new members to the community
- Create, edit, vote, and comment actions require authentication

## Out of Scope

- Built-in survey/questionnaire builder (entrepreneurs use external tools and share links)
- Mentor/advisor roles or curated reviewer groups (can be added later)
- AI-powered feedback or summarization
- Monetization or paid promotion of projects
