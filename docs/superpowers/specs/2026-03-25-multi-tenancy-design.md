# Multi-Tenancy Design: AIT Community Hub

**Date:** 2026-03-25
**Status:** Draft
**Approach:** Hybrid — Core in Drizzle, Content Bridged via Payload (Approach C)

## Overview

Pivot the AIT Community platform from a single-community platform to a multi-tenant hub where external AI communities (primarily physical communities) can create an online presence, onboard their members, and benefit from AIT's infrastructure. The platform remains fully free, funded by platform-level sponsors.

AIT becomes the default community (first tenant), and all existing members are migrated into it. New external communities join the platform alongside AIT, sharing global content while maintaining their own scoped spaces.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Branding | Minimal — consistent AIT look, community gets name/logo/description |
| Membership model | Multi-community — one account, join many |
| Role hierarchy | Owner > Admin > Moderator > Member |
| Content scoping | Community-scoped + global content visible to all |
| AIT migration | AIT becomes the default community (first tenant) |
| Join policies | Flexible per community: open, invite-only, approval-required |
| Discovery | Opt-in directory listing (admin chooses) |
| Agents | Stay personal, work across communities |
| Gamification | Global XP/badges across all communities |
| Sponsors | Platform-level only, visible everywhere |
| Revenue model | Fully free, sponsor-supported |

## Architecture: Hybrid (Drizzle + Payload Bridge)

Community infrastructure (communities, memberships, roles, settings, join policies) lives entirely in Drizzle's `app` schema. Content managed by Payload CMS (events, forum threads, etc.) gets a `communityId` text field that references the Drizzle community record. tRPC handles all community logic; Payload handles content creation with community context injected.

This matches the existing pattern where `eventRegistrations` in Drizzle reference Payload event IDs by text.

---

## Section 1: Data Model — Community Core (Drizzle)

Three new tables in the `app` schema. All IDs use `varchar(255)` with `crypto.randomUUID()` to match the existing codebase pattern. Enum-like columns use `varchar` with `.$type<>()` for TypeScript narrowing (matching the existing convention that avoids `pgEnum` to prevent conflicts with Payload CMS enums in the public schema).

### `communities`

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(255), `crypto.randomUUID()` | PK |
| name | text | Required, unique |
| slug | text | URL-friendly, unique, used in routes |
| description | text | Optional |
| logoUrl | text | Optional |
| joinPolicy | varchar(30), `.$type<'open' \| 'invite_only' \| 'approval_required'>()` | Default: `'open'` |
| isListedInDirectory | boolean | Default: `false` (opt-in discovery) |
| createdBy | varchar(255) (FK → user.id) | The founding owner |
| deletedAt | timestamp | Nullable, soft delete support |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### `communityMemberships`

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(255), `crypto.randomUUID()` | PK |
| communityId | varchar(255) (FK → communities.id) | |
| userId | varchar(255) (FK → user.id) | |
| role | varchar(20), `.$type<'owner' \| 'admin' \| 'moderator' \| 'member'>()` | Default: `'member'` |
| status | varchar(30), `.$type<'active' \| 'pending_approval' \| 'invited' \| 'banned'>()` | Default: `'active'` |
| joinedAt | timestamp | |
| updatedAt | timestamp | Tracks role/status transitions |
| invitedBy | varchar(255) (FK → user.id) | Nullable, who invited this member |

Unique constraint on `(communityId, userId)`.

**Indexes:**
- `(userId)` — for user-centric lookups (`getMyCommunities`)
- `(communityId, status)` — for filtered member listing and approval queues
- `(communityId, role)` — for role-based lookups (finding admins for notifications)

### `communityInvites`

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(255), `crypto.randomUUID()` | PK |
| communityId | varchar(255) (FK → communities.id) | |
| code | text | Unique invite code for link-based invites |
| createdBy | varchar(255) (FK → user.id) | Admin who created the invite |
| maxUses | integer | Nullable (unlimited if null) |
| useCount | integer | Default: 0 |
| expiresAt | timestamp | Nullable (never expires if null) |
| createdAt | timestamp | |

### Key behaviors

- When a community is created, the creator gets an `owner` membership automatically.
- Owners can appoint admins, admins can appoint moderators.
- `pending_approval` status is used when someone requests to join an `approval_required` community.
- `invited` status is set when an admin directly invites a user (transitions to `active` on acceptance).
- Invite links generate a `communityInvites` record with a shareable code.
- A community must always have at least one owner.
- Communities support soft deletion via `deletedAt`. A community with `deletedAt` set is hidden from all queries and directory listings.
- The `invitedBy` field on `communityMemberships` should have a Drizzle relation defined (aliased as `inviter`) so it can be queried via the relational API.

---

## Section 2: Content Scoping — Payload CMS Bridge

### Community-scoped content (visible within community + community profile page)

Payload collections that get a `communityId` text field:

- **Events** — community-specific gatherings
- **ForumThreads** — community discussions
- **ForumReplies** — denormalized `communityId` from parent thread (avoids cross-collection joins in Payload access control)
- **CommunityIdeas** — community idea proposals
- **IdeaVotes** — denormalized `communityId` from parent idea
- **Comments** — denormalized `communityId` from parent content (inherits scope of the content being commented on)

The `communityId` field in Payload collections is a plain text field with a custom admin component that renders a community selector dropdown (rather than raw ID input):

```
communityId: {
  type: 'text',
  index: true,
  admin: {
    position: 'sidebar',
    components: {
      Field: CommunitySelectField  // Custom component that fetches communities via tRPC
    }
  }
}
```

### Always-public content (visible to everyone, community is attribution only)

Payload collections that get a `communityId` text field as attribution only (no access restriction):

- **Jobs** — broader reach benefits poster and seeker
- **LaunchpadProjects** — showcasing benefits from maximum visibility
- **Challenges** — open participation drives cross-community engagement

These get the same `communityId` text field, but it serves as an attribution tag ("posted by X community") without restricting visibility.

### Global content (no community scoping)

- **Articles** (blog) — platform-level content
- **Sponsors** — platform-level visibility
- **SponsorApplications** — platform-level
- **Pages** — static pages
- **Media** — shared asset storage
- **Speakers** — shared across events

### CommunityRules global

The existing `CommunityRules` Payload global stays platform-level for this version. All communities share the same platform rules. Per-community rules are a future consideration listed in Out of Scope.

### Scoping rules

- `communityId = null` → global content, visible to everyone
- `communityId = "<id>"` → community-scoped content, visible to community members + browsable from community profile if community is listed

### Access control in Payload

- **Read:** show content where `communityId` is null OR matches one of the user's active community memberships. For public/attribution-only content types, no membership check needed.
- **Create:** community admins/moderators can create content scoped to their community; platform admins can create global content.
- **Update/Delete:** community admins can manage their community's content; platform admins can manage everything.

### Drizzle tables

- `challengeChannels` — gets nullable `communityId` column
- `benchmarkQuestions` — gets nullable `communityId` column (attribution only, no access restriction). Note: this is a Drizzle table, not a Payload collection.
- `activityEvents` — gets nullable `communityId` column
- `notifications` — gets nullable `communityId` column
- Note: `IdeaVotes` is a Payload collection (not a Drizzle table) and is already covered in the Payload section above.
- Tables like `eventRegistrations`, `challengeEnrollments`, `challengeProgress` inherit scope through their parent event/challenge — no changes needed.

---

## Section 3: Routing & Navigation

### Existing route migration

The existing `/[locale]/community/` routes (forum threads, ideas) conflict with the new `/[locale]/communities/` namespace. These existing routes will be migrated:

| Old Route | New Location | Notes |
|-----------|-------------|-------|
| `/[locale]/community` | `/[locale]/communities/ait/forum` | Forum content moves into AIT community |
| `/[locale]/community/[slug]` | `/[locale]/communities/ait/forum/[slug]` | Individual thread pages |

Redirects from old `/community/*` paths to new locations for backwards compatibility.

### New routes

| Route | Purpose |
|-------|---------|
| `/[locale]/communities` | Public directory (listed communities) |
| `/[locale]/communities/[slug]` | Community profile page (overview, stats, activity) |
| `/[locale]/communities/[slug]/events` | Community's events |
| `/[locale]/communities/[slug]/challenges` | Community's challenges |
| `/[locale]/communities/[slug]/forum` | Community's forum threads |
| `/[locale]/communities/[slug]/members` | Community's member list |
| `/[locale]/communities/[slug]/launchpad` | Community's projects |
| `/[locale]/communities/[slug]/jobs` | Community's job listings |
| `/[locale]/dashboard/communities` | User's community memberships overview |
| `/[locale]/dashboard/communities/[slug]/manage` | Community admin panel (owner/admin only) |
| `/[locale]/dashboard/communities/[slug]/manage/members` | Member management, approvals, invites |
| `/[locale]/dashboard/communities/[slug]/manage/settings` | Community settings |
| `/[locale]/join/[code]` | Invite link handler |

### Revised navigation

**Primary nav (reorganized from 10+ items to ~6):**

| Item | Content |
|------|---------|
| Home | Landing / platform overview |
| Communities | Directory + community pages |
| Explore | Hub page linking to: Challenges, Launchpad, Jobs, Benchmark |
| Blog | Articles |
| Events | Global + user's communities' events |
| Impact | Platform metrics |

**Inside a community page (`/communities/[slug]`) — sub-navigation:**

| Tab | Content |
|-----|---------|
| Overview | Description, stats, recent activity |
| Forum | Community discussions |
| Events | Community-scoped events |
| Ideas | Community idea proposals |
| Members | Member list |

**Dashboard sidebar:**

| Item | Content |
|------|---------|
| Overview | Existing dashboard |
| My Communities | List of memberships, manage links for admins |
| Profile | Existing profile |
| Notifications | Existing |

Existing routes (`/events`, `/challenges`, `/forum`, etc.) continue to show global + aggregated content.

---

## Section 4: tRPC API Layer

### Router naming

The existing `community` router (registered as `community` in `root.ts`) handles forum threads, ideas, votes, and rules. It will be **renamed to `forum`** to reflect its actual contents. The new multi-tenancy router will be registered as `communities` (plural) to avoid the naming collision.

### New router: `communities`

**Public procedures:**

| Procedure | Purpose |
|-----------|---------|
| `list` | Browse listed communities (directory) with search/filter |
| `getBySlug` | Get community public profile |
| `getMembers` | Public member list for a community (only if community is listed in directory or user is a member) |

**Protected procedures (authenticated user):**

| Procedure | Purpose |
|-----------|---------|
| `create` | Create a new community (user becomes owner) |
| `join` | Join an open community |
| `requestToJoin` | Request membership for approval-required community |
| `acceptInvite` | Accept an invite (by code or direct) |
| `leave` | Leave a community |
| `getMyCommunities` | List communities the user belongs to |

**Admin procedures (role-checked):**

| Procedure | Purpose |
|-----------|---------|
| `updateSettings` | Name, description, logo, join policy, directory listing |
| `inviteMember` | Direct invite by email/userId |
| `createInviteLink` | Generate shareable invite code |
| `revokeInviteLink` | Disable an invite code |
| `approveRequest` | Approve a pending membership |
| `rejectRequest` | Reject a pending membership |
| `setMemberRole` | Promote/demote (respecting hierarchy) |
| `transferOwnership` | Transfer owner role to another active member; transferor is demoted to admin (owner only) |
| `banMember` | Ban a member |
| `removeMember` | Remove a member |

### Middleware: `communityProcedure`

Reusable tRPC middleware that:
1. Takes `slug` from input (matching URL parameters available to the frontend)
2. Resolves slug to community record
3. Looks up the user's membership and role
4. Injects `{ community, membership, role }` into tRPC context
5. Throws `FORBIDDEN` if user isn't a member (for member-only procedures)
6. Throws `NOT_FOUND` if community doesn't exist or is soft-deleted

### Role hierarchy enforcement

- Owners can manage admins, moderators, and members
- Admins can manage moderators and members
- Moderators can manage members only (and moderate content)
- No one can modify someone at or above their own role level
- A community must always have at least one owner

### Known limitations

- No rate limiting on `create` — any authenticated user can create communities. A future iteration should add a max communities per user limit or platform admin approval for community creation.

---

## Section 5: Migration Strategy

### Step 1: Schema additions (non-breaking)

- Create `communities`, `communityMemberships`, `communityInvites` tables in Drizzle
- Add nullable `communityId` text field to Payload collections: Events, ForumThreads, ForumReplies, CommunityIdeas, IdeaVotes, Comments, Jobs, LaunchpadProjects, Challenges
- Add nullable `communityId` column to Drizzle tables: `challengeChannels`, `benchmarkQuestions`, `activityEvents`, `notifications`
- No existing data changes — everything still works

### Step 2: Rename existing router

- Rename `community` tRPC router to `forum` in `root.ts` and update all frontend call sites (`api.community.*` → `api.forum.*`)

### Step 3: Seed the AIT community

- Insert into `communities`: name "AIT Community", slug "ait"
- Migration script creates `communityMemberships` for every existing user (role: `member`, status: `active`)
- Designate platform admin(s) as `owner` of AIT community
- Existing content stays with `communityId = null` (global) — no retroactive tagging needed

### Step 4: Wire up new features

- Add `communities` tRPC router and procedures
- Update `logActivity` helper function to accept optional `communityId` parameter
- Build community pages, directory, and dashboard sections
- Build `CommunitySelectField` custom Payload admin component for the `communityId` dropdown
- Add community context to content creation flows
- Update Payload access control to respect community membership

### Step 5: Update navigation and routes

- Reorganize nav to new structure (Explore hub, Communities entry)
- Add community sub-navigation
- Migrate `/community/*` routes to `/communities/ait/forum/*` with redirects

### What stays untouched

- Auth system (better-auth)
- Agent system (personal agents)
- XP/badges (global gamification)
- Sponsors (platform-level)
- Blog/articles (global)

### Rollback safety

All community columns are nullable and new tables are additive. Rolling back means dropping new tables and columns — no existing functionality is altered. The router rename (Step 2) is the only potentially disruptive change and should be done as a separate commit.

---

## Section 6: Activity Logging & Notifications

### New activity event actions

| Action | Trigger |
|--------|---------|
| `community.created` | User creates a community |
| `community.joined` | User joins a community |
| `community.join_requested` | User requests to join an approval-required community |
| `community.left` | User leaves a community |
| `community.member_approved` | Admin approves a join request |
| `community.member_banned` | Admin bans a member |
| `community.member_removed` | Admin removes a member |
| `community.role_changed` | Admin changes a member's role |
| `community.ownership_transferred` | Owner transfers ownership to another member |
| `community.invite_created` | Admin creates an invite link |

### New notification types

| Type | Recipient | Trigger |
|------|-----------|---------|
| `community_join_request` | Owner/Admins | Someone requests to join |
| `community_request_approved` | Requesting user | Join request approved |
| `community_request_rejected` | Requesting user | Join request rejected |
| `community_role_changed` | Affected user | Role was changed |
| `community_invite_accepted` | Inviting admin | Someone accepted invite |
| `community_member_removed` | Affected user | They were removed from the community |
| `community_banned` | Affected user | They were banned |

Existing activity events and notifications continue working with `communityId = null`.

---

## Section 7: i18n

New translation keys under `communities` namespace in `en.json` and `nl.json`:

```
communities.directory.title
communities.directory.search
communities.directory.empty
communities.create.title
communities.create.name
communities.create.slug
communities.create.description
communities.create.joinPolicy
communities.create.joinPolicy.open
communities.create.joinPolicy.inviteOnly
communities.create.joinPolicy.approvalRequired
communities.profile.members
communities.profile.events
communities.profile.forum
communities.profile.ideas
communities.profile.join
communities.profile.requestToJoin
communities.profile.pending
communities.profile.leave
communities.manage.settings
communities.manage.members
communities.manage.invites
communities.manage.approvals
communities.roles.owner
communities.roles.admin
communities.roles.moderator
communities.roles.member
communities.notifications.joinRequest
communities.notifications.approved
communities.notifications.rejected
communities.notifications.roleChanged
communities.notifications.removed
communities.nav.myCommunities
communities.nav.explore
```

---

## Out of Scope

The following are explicitly not part of this design and may be considered for future work:

- Community-level agents (agents stay personal)
- Per-community XP/badges (gamification stays global)
- Community-level sponsors (sponsors stay platform-level)
- Custom branding/theming per community (minimal branding only)
- Subdomain routing per community
- Community-to-community federation or messaging
- Billing or paid community tiers
- Per-community rules (CommunityRules global stays platform-level)
- Community deletion workflow (soft delete column exists but admin UI/flow is deferred)
