# Community Admin Features — Batch 1: Wire Up Existing APIs

**Date:** 2026-03-25
**Status:** Draft

## Overview

The community backend has ~10 fully implemented tRPC procedures with no corresponding frontend. This spec covers wiring them up, restructuring the settings page with sidebar navigation, and cleaning up duplicate/dead routes.

## Scope

### In scope
1. Settings page redesign with sidebar layout
2. Member management (roles, approve/reject, ban/unban)
3. Invite link management (create, list, revoke)
4. Forum thread moderation (pin/lock via kebab menu)
5. Idea status management (admin kebab menu)
6. Route cleanup (remove duplicate dashboard manage pages)

### Out of scope
- Notifications, content reporting, analytics (Batch 3)
- Thread/reply editing, event editing, ownership transfer UI (Batch 2)
- Jobs and Launchpad (intentionally global, not community-scoped)

### Important data model change
7. Convert global `CommunityRules` to per-community collection with admin editing UI

## 1. Settings Page Redesign

### Current state
- Single page at `/communities/[slug]/settings` rendering `<SettingsForm>` directly
- Duplicate at `/dashboard/communities/[slug]/manage/settings` (to be deleted)
- Separate manage members page at `/dashboard/communities/[slug]/manage/members` (to be deleted)

### New structure

Convert `/communities/[slug]/settings` into a layout with sidebar navigation.

**Route structure:**
```
/communities/[slug]/settings/          → redirects to /general
/communities/[slug]/settings/general   → existing SettingsForm
/communities/[slug]/settings/members   → member management (replaces manage/members)
/communities/[slug]/settings/invites   → invite link management (new)
/communities/[slug]/settings/rules     → community rules editor (new)
```

**Layout (`settings/layout.tsx`):**
- Left sidebar (w-48, hidden on mobile → hamburger or top tabs on mobile)
- Sidebar items: General, Members, Invites, Rules
- "Ownership" item only shown if user role is `owner`. Do NOT create the ownership page in this batch — just add the sidebar link pointing to `/settings/ownership` (which will 404 until Batch 2). This signals the feature is coming without building it prematurely.
- Content area fills remaining space
- Access control: only `owner` or `admin` roles can access

**Sidebar component (`src/components/communities/settings/settings-sidebar.tsx`):**
- Uses `usePathname()` for active state
- Items are `<Link>` elements styled consistently with the app (muted text, highlighted on active)
- Mobile: collapses to horizontal tabs above content (reuses the pattern from community nav but smaller)

## 2. Member Management

**Page:** `/communities/[slug]/settings/members`
**Component:** `src/components/communities/settings/members-settings.tsx`

### Tabs (using shadcn `<Tabs>`)

**Active tab** (default):
- Lists active members using `communities.getMembers` (filtered to `status: "active"`)
- Each row: avatar, display name, role badge, actions
- Actions per member (except for the current user and owner):
  - **Role dropdown** (`<Select>`): shows current role, allows changing to owner/admin/moderator/member. Uses `communities.setMemberRole`. Only shows roles the current user can assign (based on role hierarchy from `canManageRole`). Owner role option only visible to owners.
  - **Remove button**: calls `communities.removeMember` with confirmation dialog
  - **Ban button**: calls `communities.banMember` with confirmation dialog
- Owner row shows role badge only, no action buttons

**Pending tab** (only shown when community `joinPolicy === "approval_required"`):
- Lists members with `status: "pending_approval"`
- Requires a new query or filter — the existing `getMembers` query filters by `status: "active"`. We need to either:
  - Add a `status` filter param to `getMembers`, OR
  - Create a `getPendingRequests` query
- **Recommended:** Add optional `status` param to existing `getMembers` query
- Each row: avatar, display name, requested date
- Actions: **Approve** button (calls `communities.approveRequest`), **Reject** button (calls `communities.rejectRequest` with confirmation)

**Banned tab:**
- Lists members with `status: "banned"`
- Same approach: use `getMembers` with `status: "banned"` filter
- Each row: avatar, display name, banned badge
- Action: **Unban** button
- Unban requires a new backend procedure. The simplest approach: add `unbanMember` procedure to the communities router that sets status back to `"active"` (or deletes the membership row to allow re-joining)

### Backend changes needed

1. **`getMembers` — add optional `status` filter:**
   Current query only returns active members. Add `status?: "active" | "pending_approval" | "banned"` to the input schema. Default to `"active"` for backwards compatibility.

2. **`unbanMember` — new procedure:**
   ```
   Input: { slug: string, userId: string }
   Auth: communityProcedure, admin/owner only
   Action: Delete the membership row (status: "banned") so the user can re-join
   ```
   Deleting the row (rather than setting to "active") is cleaner — the banned user doesn't automatically rejoin, they just become eligible to join again.

## 3. Invite Link Management

**Page:** `/communities/[slug]/settings/invites`
**Component:** `src/components/communities/settings/invites-settings.tsx`

### Create invite section

- "Create Invite Link" button opens an inline form (not a dialog — keeps it lightweight)
- Form fields:
  - **Max uses** (optional number input, placeholder: "Unlimited")
  - **Expires in** (optional select: 1 hour, 6 hours, 1 day, 7 days, 30 days, never). Converted to `expiresAt` timestamp before sending.
- On submit: calls `communities.createInviteLink`
- On success: show the generated link in a copyable input with a "Copy" button, toast success

### Active invites list

- Requires a new query: `getInviteLinks` to list active invites for a community
- Each row: truncated code, uses (e.g., "3 / 10" or "5 / unlimited"), expires (relative time or "Never"), created by
- Action: **Revoke** button (calls `communities.revokeInviteLink` with confirmation)

### Backend changes needed

1. **`getInviteLinks` — new query:**
   ```
   Input: { slug: string }
   Auth: communityProcedure, admin/owner only
   Returns: Array of { id, code, maxUses, useCount, expiresAt, createdAt }
   Filters: only non-expired, non-maxed-out invites (or all invites with status indicator)
   ```
   Return all invites (including expired/used-up) so admins have full visibility. Mark expired/maxed as inactive in the UI.

## 4. Per-Community Rules

### Current state (broken)

`CommunityRules` is a Payload **Global** (singleton) — one set of rules for the entire platform. `RulesAcceptance` tracks acceptance per user+version but has no `communityId`. The `getRules`/`acceptRules` procedures in the forum router fetch the global, not per-community rules. This means all communities share the same rules, which defeats the purpose of multi-tenancy.

### Data model changes

**Convert `CommunityRules` from GlobalConfig to CollectionConfig:**

Current (`src/collections/CommunityRules.ts`): `GlobalConfig` with fields: version, effectiveDate, sections[].
New: `CollectionConfig` with the same fields **plus** `communityId` (text, required, indexed).

Fields to keep: `version`, `effectiveDate`, `sections[]` (with title, slug, icon, content — all localized fields stay localized).
Fields to add: `communityId` (text, required, indexed) — links to the Drizzle `communities` table by ID.

Each community gets its own rules document. If a community has no rules document, forum/idea submission is allowed without acceptance (rules are optional per community).

**Update `RulesAcceptance`:**

Add `communityId` (text, required, indexed) to track which community's rules were accepted. The unique constraint becomes: userId + rulesVersion + communityId.

### Settings UI

**Page:** `/communities/[slug]/settings/rules`
**Component:** `src/components/communities/settings/rules-settings.tsx`

**Rules editor:**
- Shows current rules version and effective date (if rules exist for this community)
- Section list: each section shows title, icon, and a rich text content field
- Admin can:
  - **Add section** — append a new section with title, slug (auto-generated from title), icon select, rich text content
  - **Edit section** — inline editing of title, icon, content
  - **Remove section** — delete a section with confirmation
  - **Reorder sections** — drag handle or up/down buttons
- **Publish** button: increments version number, sets effectiveDate to now, saves to Payload. This forces all members to re-accept.
- If no rules exist yet: show empty state with "Create Rules" button that creates the initial document

Keep it simple — no draft/preview system. The admin edits directly and publishes.

For the rich text editor: reuse whatever rich text component is already used in the forum's create-thread-form (likely Payload's lexical editor or a simple textarea with markdown).

### Backend changes

1. **Convert `CommunityRules` collection:**
   - Change from `GlobalConfig` to `CollectionConfig`
   - Add `communityId` field
   - Update `payload.config.ts`: move from `globals` array to `collections` array

2. **Update `RulesAcceptance` collection:**
   - Add `communityId` field (text, required, indexed)

3. **Update `getRules` procedure:**
   ```
   Input: { communitySlug: string, locale?: "en" | "nl" }
   ```
   - Look up community by slug to get ID
   - Query `community-rules` collection filtered by `communityId`
   - If no rules document exists, return `{ rules: null, hasAccepted: true }` (no rules = no acceptance needed)
   - If rules exist, check `rules-acceptance` for userId + version + communityId

4. **Update `acceptRules` procedure:**
   ```
   Input: { communitySlug: string }
   ```
   - Look up community rules by communityId
   - Create `rules-acceptance` record with communityId

5. **New `upsertRules` procedure (in communities or forum router):**
   ```
   Input: { slug: string, sections: Array<{ title, slug, icon, content }> }
   Auth: communityProcedure, admin/owner only
   Action:
     - If no rules doc exists for this community: create one (version: 1, effectiveDate: now)
     - If rules doc exists: update sections, increment version, set effectiveDate to now
   ```

6. **Update guards in `createThread`, `addReply`, `submitIdea`, `toggleVote`:**
   - These currently check global rules. Update to check community-specific rules.
   - If no rules exist for the community, skip the acceptance check.

### Migration

The existing global rules data needs to be handled:
- If there's meaningful content in the global: create a migration that copies it as the rules for each existing community
- If the global is just a placeholder: delete it and let each community create their own
- Remove the global from `payload.config.ts`

## 5. Forum Thread Moderation

### Thread card changes (`src/components/forum/thread-card.tsx`)

- Add a kebab menu (`<DropdownMenu>` from shadcn) to thread cards
- Only visible when user has `admin`, `owner`, or `moderator` role in the community
- Menu items:
  - **Pin / Unpin** — calls `forum.pinThread({ threadId, isPinned: !current })`
  - **Lock / Unlock** — calls `forum.lockThread({ threadId, isLocked: !current })`
- Visual indicators already exist: pinned shows "PIN" label. Add a lock icon for locked threads.

### Thread detail changes (`src/components/forum/thread-detail.tsx`)

- When thread is locked, show a banner: "This thread has been locked" and hide the reply form
- Same kebab menu as on thread card for admin/mod actions

### Props change

`ThreadCard` needs to receive the current user's community role to conditionally show the menu. This can be passed down from the forum page, which already has access to membership data via the community layout.

The forum page (`src/components/forum/forum-page.tsx`) needs to accept and pass `memberRole` to each `ThreadCard`.

## 6. Idea Status Management

### Idea card changes (`/communities/[slug]/ideas/page.tsx`)

- Add a kebab menu to each idea card, visible only to admins/owners
- Menu items:
  - **Mark as Implemented** (when status is `open` or `rejected`)
  - **Mark as Rejected** (when status is `open` or `implemented`)
  - **Reopen** (when status is `implemented` or `rejected`)

### Backend changes needed

1. **`updateIdeaStatus` — new procedure in forum router:**
   ```
   Input: { ideaId: string, status: "open" | "implemented" | "rejected" }
   Auth: requires admin/owner role in the idea's community
   Action: Update idea status in Payload CMS
   ```
   Currently there's no endpoint to change idea status — it can only be done via Payload admin panel.

### Props change

The ideas page needs access to the current user's community role. It can get this from `getMyCommunities` (same pattern as the settings page).

## 7. Route Cleanup

### Delete these files/directories:
- `src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx`
- `src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx`
- `src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx`
- The entire `[slug]/manage/` directory under dashboard communities

### Update references:
- `src/app/[locale]/dashboard/communities/page.tsx` — the "Manage" button already points to `/communities/${m.slug}/settings` (verified in current code). No change needed.

### Clean up dead challenge references:
- The challenges page was already deleted. Verify no nav items or links still reference it.

## New Files Summary

| File | Purpose |
|------|---------|
| `src/app/[locale]/communities/[slug]/settings/layout.tsx` | Settings layout with sidebar + access control |
| `src/app/[locale]/communities/[slug]/settings/general/page.tsx` | Wraps existing `<SettingsForm>` |
| `src/app/[locale]/communities/[slug]/settings/members/page.tsx` | Member management page |
| `src/app/[locale]/communities/[slug]/settings/invites/page.tsx` | Invite link management page |
| `src/components/communities/settings/settings-sidebar.tsx` | Sidebar nav component |
| `src/components/communities/settings/members-settings.tsx` | Members tab content |
| `src/components/communities/settings/invites-settings.tsx` | Invites management content |
| `src/app/[locale]/communities/[slug]/settings/rules/page.tsx` | Rules editor page |
| `src/components/communities/settings/rules-settings.tsx` | Rules editor content |

## Modified Files Summary

| File | Change |
|------|--------|
| `src/app/[locale]/communities/[slug]/settings/page.tsx` | Convert to redirect to `/settings/general` |
| `src/server/api/routers/communities.ts` | Add `status` param to `getMembers`, add `unbanMember`, add `getInviteLinks`, add `upsertRules` |
| `src/server/api/routers/forum.ts` | Add `updateIdeaStatus`, update `getRules`/`acceptRules` to per-community, update guards |
| `src/collections/CommunityRules.ts` | Convert from GlobalConfig to CollectionConfig, add `communityId` |
| `src/collections/RulesAcceptance.ts` | Add `communityId` field |
| `src/payload.config.ts` | Move CommunityRules from globals to collections |
| `src/components/community/rules-provider.tsx` | Pass communitySlug, update to use per-community rules |
| `src/components/forum/thread-card.tsx` | Add kebab menu for pin/lock |
| `src/components/forum/forum-page.tsx` | Accept and pass `memberRole` prop |
| `src/components/forum/thread-detail.tsx` | Locked thread banner, kebab menu |
| `src/app/[locale]/communities/[slug]/ideas/page.tsx` | Add kebab menu for idea status |
| `messages/en.json` | Add translation keys for new UI elements |
| `messages/nl.json` | Add translation keys (Dutch) |

## Deleted Files

| File | Reason |
|------|--------|
| `src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx` | Duplicate route |
| `src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx` | Duplicate of community settings |
| `src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx` | Moving to community settings |

## Translation Keys Needed

```
communities.settings.sidebar.general
communities.settings.sidebar.members
communities.settings.sidebar.invites
communities.settings.sidebar.rules
communities.settings.sidebar.ownership
communities.settings.members.activeTab
communities.settings.members.pendingTab
communities.settings.members.bannedTab
communities.settings.members.changeRole
communities.settings.members.approve
communities.settings.members.reject
communities.settings.members.unban
communities.settings.members.approveConfirm
communities.settings.members.rejectConfirm
communities.settings.members.unbanConfirm
communities.settings.members.roleChanged
communities.settings.members.approved
communities.settings.members.rejected
communities.settings.members.unbanned
communities.settings.members.noPending
communities.settings.members.noBanned
communities.settings.invites.title
communities.settings.invites.create
communities.settings.invites.maxUses
communities.settings.invites.unlimited
communities.settings.invites.expiresIn
communities.settings.invites.never
communities.settings.invites.hours (with count)
communities.settings.invites.days (with count)
communities.settings.invites.linkCopied
communities.settings.invites.revoke
communities.settings.invites.revokeConfirm
communities.settings.invites.revoked
communities.settings.invites.noInvites
communities.settings.invites.uses (formatted: "3 / 10")
communities.settings.invites.expired
forum.actions.pin
forum.actions.unpin
forum.actions.lock
forum.actions.unlock
forum.actions.threadLocked
community.ideas.markImplemented
community.ideas.markRejected
community.ideas.reopen
community.ideas.statusChanged
communities.settings.rules.title
communities.settings.rules.empty
communities.settings.rules.create
communities.settings.rules.publish
communities.settings.rules.publishConfirm
communities.settings.rules.published
communities.settings.rules.addSection
communities.settings.rules.removeSection
communities.settings.rules.removeSectionConfirm
communities.settings.rules.sectionTitle
communities.settings.rules.sectionContent
communities.settings.rules.sectionIcon
communities.settings.rules.currentVersion
communities.settings.rules.effectiveDate
```
