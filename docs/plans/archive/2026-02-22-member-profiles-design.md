# Member Profiles & Gamification — Design Document

**Date:** 2026-02-22
**Phase:** 3 (Member Profiles)
**Status:** Approved

## Goal

Add member profiles with a public directory, profile editing from the dashboard, and a gamification system (XP + badges) with a public leaderboard.

## Architecture

Member profile data lives in Drizzle (like event registrations), not Payload CMS. Payload remains for admin-managed content only. A new `membersRouter` in tRPC handles all profile and gamification CRUD. Avatars use Gravatar (email hash) with GitHub OAuth avatar as override — no file uploads.

## Data Model

### `memberProfiles` table (Drizzle, 1:1 with `user`)

| Column | Type | Notes |
|--------|------|-------|
| userId | varchar(255), PK, FK → user.id | 1:1 relationship |
| displayName | varchar(255) | Required |
| bio | text | Nullable |
| skills | json | Array of strings, e.g. `["AI", "Python"]` |
| company | varchar(255) | Nullable |
| linkedinUrl | varchar(255) | Nullable |
| githubUrl | varchar(255) | Nullable |
| websiteUrl | varchar(255) | Nullable |
| isPublic | boolean | Default true |
| xp | integer | Default 0 |
| level | integer | Default 1 |
| createdAt | timestamp | Default now |
| updatedAt | timestamp | Auto-update |

### `memberBadges` table (join table)

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(255), PK | UUID |
| userId | varchar(255), FK → user.id | |
| badgeSlug | varchar(100) | e.g. `first_event`, `speaker` |
| earnedAt | timestamp | Default now |

Unique constraint on `(userId, badgeSlug)` — each badge earned once.

### Avatar Strategy

No DB field. Computed at render time:
1. `user.image` (set by GitHub OAuth) — use if present
2. Gravatar via MD5 hash of `user.email` — fallback
3. Initials from `displayName` — final fallback

## XP System

### XP-Earning Actions

| Action | XP | Trigger |
|--------|-----|---------|
| Complete profile | 50 | First time all required fields filled |
| Register for event | 25 | On successful registration |
| Attend event | 100 | Registration status changed to `attended` |
| First event bonus | 50 | Badge unlock bonus (`first_event`) |

### Leveling Formula

`level = floor(xp / 200) + 1`

- Level 1: 0–199 XP
- Level 2: 200–399 XP
- Level 3: 400–599 XP
- Linear progression, easy to adjust.

### Implementation

Server-side only. Helper function `awardXp(userId, amount)` increments `xp` column and recalculates `level`. Called from tRPC mutations that handle triggering actions.

## Badges

### Badge Definitions (TypeScript constant, not DB)

| Slug | Name | Condition |
|------|------|-----------|
| `profile_complete` | Profile Complete | All profile fields filled |
| `first_event` | First Event | Attended 1 event |
| `regular` | Regular | Attended 3 events |
| `veteran` | Veteran | Attended 10 events |
| `early_adopter` | Early Adopter | Among first 100 members to sign up |
| `speaker` | Speaker | Listed as speaker on any event |

### Implementation

Helper `checkAndAwardBadges(userId)` runs after XP-granting actions. Checks conditions, inserts new badges if earned (idempotent via unique constraint). Badge definitions live in `src/lib/gamification.ts` as a constant map.

## Pages & UI

### Routes

- `/[locale]/members` — Public member directory
- `/[locale]/members/[id]` — Public member profile
- `/[locale]/dashboard` — Extended with profile section

### Member Directory (`/members`)

- Top: leaderboard strip — top 5 members by XP (avatar, name, level, badge count)
- Search input (name/company) + skill tag filter chips
- Grid of member cards (only `isPublic: true`)
- Card: avatar, displayName, company, level badge (`LVL 3`), top 3 skill tags, badge count

### Public Profile (`/members/[id]`)

- Header: avatar, displayName, company, level + XP progress bar to next level
- Bio section
- Skills as tag chips
- Social links (LinkedIn, GitHub, website) as icon buttons
- Badges: grid of earned badges with names + earned dates
- Events attended count

### Dashboard Profile Section

- New `/ MY PROFILE` section above `/ MY EVENTS`
- No profile: "Complete your profile" prompt card with CTA (+50 XP incentive)
- Has profile: compact summary card with `[EDIT]` button
- Edit: inline form — displayName, bio, skills (tag input), company, URLs, isPublic toggle
- XP bar + level display + earned badges row

## tRPC Router (`membersRouter`)

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `getMyProfile` | query | protected | Own profile + badges |
| `upsertProfile` | mutation | protected | Create/update profile, awards XP on first completion |
| `getPublicProfile` | query | public | Single member by userId (only if isPublic) |
| `listMembers` | query | public | Paginated, search/filter by name/company/skills, sorted by XP |
| `getLeaderboard` | query | public | Top 5 members by XP |

## i18n

Add `members` namespace to `messages/en.json` and `messages/nl.json` covering:
- Directory page labels (title, search placeholder, filter labels)
- Profile page labels (sections, edit form fields)
- Badge names and descriptions
- Gamification labels (level, XP, progress)

## Navbar

Add `[M] MEMBERS` link to `navLinks` in the navbar, pointing to `/members`.
