# Member Article Writing — Design

## Summary

Allow members (non-admins) to write and publish articles on the AITCOM platform. Articles are stored in the existing Payload Articles collection. Members write via a built-in Lexical editor in the app, with submissions flowing through tRPC to Payload's Local API. Trusted authors (level 5+ with an approved article) publish directly; others go through admin review.

## Decisions

- **Editorial model:** Trusted authors — earn publishing rights via XP level + first approved article
- **Editor:** Built-in Lexical editor (same engine as Payload, consistent rendering)
- **Storage:** Same Payload Articles collection (unified blog)
- **Content types:** Members can write articles and tutorials; talk recordings stay admin-only
- **Localization:** Single language per article — no translation requirement for members
- **XP rewards:** 10 XP on submit, 50 XP on publish
- **Architecture:** tRPC mutations → Payload Local API (consistent with forum/ideas pattern)
- **Future enhancement:** Agent-assisted writing (not in initial scope)

## Data Model Changes

### Articles Collection — New Fields

| Field | Type | Details |
|-------|------|---------|
| `authorId` | text | Better Auth user ID (null for admin-authored) |
| `authorName` | text | Display name at time of publishing |
| `authorType` | select | `admin` / `member` |
| `reviewStatus` | select | `pending_review` / `approved` / `rejected` / `changes_requested` |
| `reviewNote` | text | Admin feedback when requesting changes |

### Access Control

- Public read: `status: published` AND (`authorType: admin` OR `reviewStatus: approved`)
- Member write: only their own articles (matched by `authorId`)

### Trusted Author Logic

A member is a trusted author if:
1. Level 5+ (800+ XP)
2. Holds the `article_author` badge

No new database table needed — uses existing `memberProfiles.xp` and `memberBadges`.

## Member Writing Flow

### Creating an Article

1. Member navigates to `/blog/write` (protected route)
2. Lexical editor with fields: title, content, type (article/tutorial), tags, featured image
3. Can save as draft at any time (`status: draft`)
4. Clicks "Submit for review" or "Publish" (depending on trusted author status)

### Non-Trusted Authors (New Writers)

```
Draft → Submit for Review (pending_review) → Admin approves → Published
                                            → Admin requests changes → Member edits → Resubmit
```

- On approval: `reviewStatus: approved`, `status: published`, member earns 50 XP + `article_author` badge (first time)
- On changes requested: member sees `reviewNote`, can edit and resubmit

### Trusted Authors (Level 5+ with `article_author` Badge)

```
Draft → Publish directly (reviewStatus: approved, status: published)
```

- Earns 50 XP per published article
- Admins can still unpublish if needed

### Managing Articles

- "My Articles" section at `/blog/my-articles`
- Shows all articles with status badges (draft, pending review, changes requested, published)
- Can edit drafts and change-requested articles freely
- Published edits: trusted authors get live edit, others go back to review

## Lexical Editor & Image Uploads

### Editor

- Use `@payloadcms/richtext-lexical` client-side components
- Mirror Payload's article editor feature set: headings, bold/italic, links, code blocks, lists, blockquotes
- Render with existing `LexicalRenderer` component — zero format mismatch

### Image Uploads

- Featured image: upload via file input, stored through Payload's Media collection (Local API)
- Inline images: Lexical image plugin, same upload path
- Limits: max 5MB per image, jpg/png/webp

### Out of Scope

- No collaborative editing
- No AI-assisted writing (future enhancement with member agents)
- No embeds beyond images and code blocks
- No version history UI for members

## Admin Review & Moderation

### Payload Admin

- `reviewStatus` filter added to Articles list view
- Columns: `authorName`, `authorType`, `reviewStatus`
- Review: open article → set `reviewStatus` to approved/rejected/changes_requested
- `reviewNote` field for feedback
- Approving sets `status: published` and `publishedAt` automatically

### Notifications

- Member notified via inbox when article is approved/rejected/changes requested
- Admin notified when new article submitted for review (inbox entry or Resend email)

### Safety Nets

- Admins can unpublish or delete any member article
- Trusted author status revoked by removing `article_author` badge

## Gamification & Badges

### XP Awards

| Action | XP | When |
|--------|-----|------|
| Article submitted for review | 10 | First submit only (not re-submits) |
| Article published | 50 | On reviewStatus → approved |

### New Badges

| Badge | Trigger |
|-------|---------|
| `article_author` | First article approved (unlocks trusted author with level 5+) |
| `prolific_writer` | 5 published articles |
| `tutorial_creator` | First published tutorial |

### Activity Logging

- `article.submitted` — member submits for review
- `article.published` — article goes live
- `article.approved` — admin approves

## Routes & Components

### New Pages

| Route | Purpose | Auth |
|-------|---------|------|
| `/blog/write` | Lexical editor — new article | Protected (member) |
| `/blog/edit/[slug]` | Edit own article | Protected (owner only) |
| `/blog/my-articles` | Member's article dashboard | Protected (member) |

### New Components

| Component | Details |
|-----------|---------|
| `ArticleEditor` | Lexical editor + title/type/tags/image fields, save/submit/publish buttons |
| `MyArticlesList` | Table of member's articles with status badges and actions |
| `ReviewStatusBadge` | Visual badge for review statuses |

### New tRPC Router — `articles`

| Procedure | Purpose |
|-----------|---------|
| `articles.create` | Create draft article via Payload Local API |
| `articles.update` | Update own draft/article |
| `articles.submit` | Submit for review (or direct publish if trusted) |
| `articles.myArticles` | List member's own articles (all statuses) |
| `articles.delete` | Delete own draft (not published articles) |

### Modified Existing

- Blog detail page: show author name/link for member articles
- Dashboard: add "My Articles" shortcut
- Gamification config: add XP amounts and badge definitions
