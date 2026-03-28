# MCP Server — Community & Feed Tools

**Date:** 2026-03-26
**Status:** Draft
**Version:** 0.3.0 → 0.4.0

## Overview

Extend the MCP server with community awareness. Agents can discover, join, and participate in communities; manage communities where the owner has admin/owner privileges; and interact with the community feed. Destructive admin actions (ban, remove, transfer ownership, role changes) are routed through ghost mode as suggestions for owner review.

## Design Decisions

1. **Full autonomy** — the agent mirrors the owner's permissions. If the owner is an admin, the agent gets admin powers (with ghost mode for destructive actions).
2. **Hybrid tool pattern** — existing content tools (`browse-threads`, `browse-events`, `browse-members`, `search-knowledge`) gain an optional `communitySlug` parameter for scoping. Community-specific actions (join, leave, manage) are new tools.
3. **Ghost mode for destructive actions** — ban, remove, transfer ownership, and role changes create suggestions in the existing `agentSuggestions` table for owner approval. All other actions execute directly.
4. **Feed tools included** — designed alongside community tools for a coherent agent experience, even though the feed is not yet built.

## Scope

### In scope
- 21 new MCP tools (community management + feed)
- 4 extended existing MCP tools (community scoping)
- New agent router file for community procedures
- New agent router file for feed procedures
- New MCP domain modules for tool registration
- Ghost mode suggestions for destructive admin actions

### Out of scope
- Community rules management (read-only, no agent editing)
- Launchpad per-community scoping
- Notifications scoped to communities
- Agent-to-agent interaction within communities

---

## 1. New Agent Router — Community Procedures

**File:** `src/server/api/routers/agent-communities.ts`

Exports a plain object of procedures that gets spread into the main agent router.

### Read Procedures (scope: `read`)

| Procedure | Input | Description |
|---|---|---|
| `browseCommunities` | `{ search?, limit }` | List public communities with member counts |
| `getCommunityInfo` | `{ slug }` | Get community details + owner's membership/role |

Note: community member browsing is handled by the existing `browseMembers` procedure extended with optional `communitySlug` (see Section 2).

### Membership Procedures (scope: `contribute`)

| Procedure | Input | Description |
|---|---|---|
| `joinCommunity` | `{ slug }` | Join open community on behalf of owner |
| `requestToJoinCommunity` | `{ slug }` | Request to join approval-required community |
| `leaveCommunity` | `{ slug }` | Leave a community |
| `getOwnerCommunities` | `{}` | List communities the owner belongs to |
| `acceptCommunityInvite` | `{ code }` | Accept an invite link |

### Community Creation (scope: `contribute`)

| Procedure | Input | Description |
|---|---|---|
| `createCommunity` | `{ name, description?, joinPolicy, isListedInDirectory }` | Create a new community (owner becomes owner) |

### Admin Procedures (scope: `contribute`, require owner/admin role)

| Procedure | Input | Description |
|---|---|---|
| `updateCommunitySettings` | `{ slug, name?, description?, logoUrl?, joinPolicy?, isListedInDirectory? }` | Update community settings |
| `createCommunityInviteLink` | `{ slug, maxUses?, expiresInDays? }` | Create invite link |
| `revokeCommunityInviteLink` | `{ slug, inviteId }` | Revoke invite link |
| `getCommunityInviteLinks` | `{ slug }` | List active invite links |

### Destructive Admin Procedures (scope: `contribute`, ghost mode — saved as suggestions)

| Procedure | Input | Description |
|---|---|---|
| `suggestBanMember` | `{ slug, userId, reason }` | Suggest banning a member |
| `suggestRemoveMember` | `{ slug, userId, reason }` | Suggest removing a member |
| `suggestTransferOwnership` | `{ slug, userId, reason }` | Suggest ownership transfer |
| `suggestSetMemberRole` | `{ slug, userId, role, reason }` | Suggest role change |

All procedures use `agentProcedure`. Scope requirements are noted per group above (`read` for browsing, `contribute` for mutations). Destructive procedures validate that the owner has the required community role before creating the suggestion.

---

## 2. Extended Existing Agent Procedures — Community Scoping

These existing procedures in `src/server/api/routers/agent.ts` gain an optional `communitySlug` parameter:

| Existing Procedure | Change |
|---|---|
| `browseThreads` | Optional `communitySlug`. When provided, filter threads by community. |
| `browseEvents` | Optional `communitySlug`. When provided, filter events by community. |
| `browseMembers` | Optional `communitySlug`. When provided, filter to community members. |
| `searchKnowledge` | Optional `communitySlug`. When provided, restrict search to community content. |

### Filtering logic
- Resolve `communitySlug` to `communityId` via the communities table
- Add `where` condition filtering by `communityId` on the Payload/Drizzle query
- If community not found, throw `NOT_FOUND`
- If `communitySlug` omitted, behavior is unchanged (global/platform-wide)

### Unchanged
- `getBriefing` and `getNotifications` stay global (they aggregate across all activity)

---

## 3. New Agent Router — Feed Procedures

**File:** `src/server/api/routers/agent-feed.ts`

Exports a plain object of procedures that gets spread into the main agent router.

### Read Procedures (scope: `read`)

| Procedure | Input | Description |
|---|---|---|
| `browseFeed` | `{ communitySlug, limit, cursor? }` | Browse community feed posts (newest first, keyset pagination) |
| `getFeedComments` | `{ postId, limit }` | Get comments on a feed post |

### Write Procedures (scope: `contribute`)

| Procedure | Input | Description |
|---|---|---|
| `createFeedPost` | `{ communitySlug, content, imageUrl? }` | Post to community feed. Respects `feedPostPolicy`. Ghost mode → draft. |
| `commentOnFeedPost` | `{ postId, content }` | Comment on a feed post. Ghost mode → draft. |
| `toggleFeedLike` | `{ postId }` | Like/unlike a feed post. Executes directly even in ghost mode (low risk). |

### Guards
- All write procedures check owner is an active member of the community
- `createFeedPost` checks `feedPostPolicy` — if `"admins_only"`, owner must be admin/owner/moderator
- Ghost mode saves to `agentDrafts` table (same pattern as `replyToThread`)
- No edit/delete tools — content modification goes through the owner

---

## 4. MCP Tool Registration — Domain Modules

### New Files

| File | Responsibility |
|---|---|
| `src/app/api/mcp/community-tools.ts` | Registers community management MCP tools |
| `src/app/api/mcp/feed-tools.ts` | Registers feed MCP tools |

### Module Signature

```typescript
export function registerCommunityTools(
  server: McpServer,
  caller: Caller,
  keyData: { ownerId: string; agentId: string }
): void {
  server.registerTool("browse-communities", { ... }, async () => { ... });
  // ...
}
```

### Changes to `src/app/api/mcp/route.ts`

- Import and call `registerCommunityTools` and `registerFeedTools` inside `createMcpServer`
- Bump version from `"0.3.0"` to `"0.4.0"`
- Existing tools stay in route.ts (no churn)

### New MCP Tools (21)

**Community read:**
- `browse-communities` — list public communities with member counts
- `get-community-info` — community details + owner's membership/role
- `get-owner-communities` — list communities the owner belongs to

**Community membership:**
- `join-community` — join open community
- `request-to-join-community` — request to join approval-required community
- `leave-community` — leave a community
- `accept-community-invite` — accept invite link

**Community creation:**
- `create-community` — create new community

**Community admin:**
- `update-community-settings` — update settings
- `create-community-invite` — create invite link
- `revoke-community-invite` — revoke invite link
- `get-community-invites` — list active invite links

**Community admin (ghost mode):**
- `suggest-ban-member` — suggest banning a member
- `suggest-remove-member` — suggest removing a member
- `suggest-transfer-ownership` — suggest ownership transfer
- `suggest-set-member-role` — suggest role change

**Feed:**
- `browse-feed` — browse community feed posts
- `get-feed-comments` — get comments on a feed post
- `create-feed-post` — post to community feed
- `comment-on-feed-post` — comment on a post
- `toggle-feed-like` — like/unlike a post

### Extended Existing MCP Tools (4)

- `browse-threads` — add optional `communitySlug` input
- `browse-events` — add optional `communitySlug` input
- `browse-members` — add optional `communitySlug` input
- `search-knowledge` — add optional `communitySlug` input

### Total: ~51 tools (30 existing + 21 new)

---

## 5. Agent Router Merging Strategy

### Pattern

`agent-communities.ts` and `agent-feed.ts` export plain procedure objects:

```typescript
// agent-communities.ts
export const agentCommunityRouter = {
  browseCommunities: agentProcedure.input(...).query(...),
  joinCommunity: agentProcedure.input(...).mutation(...),
  // ...
};
```

Merged in `agent.ts`:

```typescript
import { agentCommunityRouter } from "./agent-communities";
import { agentFeedRouter } from "./agent-feed";

export const agentRouter = createTRPCRouter({
  // ... all existing procedures unchanged
  ...agentCommunityRouter,
  ...agentFeedRouter,
});
```

### File Layout

| File | Lines (approx) | Responsibility |
|---|---|---|
| `src/server/api/routers/agent.ts` | ~2400 | Existing procedures + merge imports |
| `src/server/api/routers/agent-communities.ts` | ~500 | Community procedures |
| `src/server/api/routers/agent-feed.ts` | ~200 | Feed procedures |
| `src/app/api/mcp/route.ts` | ~560 | Entry point + existing tools |
| `src/app/api/mcp/community-tools.ts` | ~400 | Community MCP tools |
| `src/app/api/mcp/feed-tools.ts` | ~150 | Feed MCP tools |

---

## 6. Ghost Mode for Destructive Actions

### Mechanism

The four destructive community actions use the existing `agentSuggestions` table:

1. Agent procedure validates the owner has the permissions to perform the action
2. Creates a row in `agentSuggestions`:
   - `type`: `"community_action"`
   - `action`: `"ban_member"` | `"remove_member"` | `"transfer_ownership"` | `"set_member_role"`
   - `metadata`: `{ communitySlug, targetUserId, role?, reason }`
   - `status`: `"pending"`
3. Returns confirmation: suggestion saved for owner review
4. Owner approves/rejects via existing agent suggestions UI

### Why these four

They are both **hard to reverse** and **affect other users directly**:
- Ban removes access
- Remove kicks a member
- Ownership transfer demotes the current owner
- Role changes affect permissions

Everything else (join, post, settings, invites) is easily reversible or only affects the owner.

### No new tables

The existing `agentSuggestions` schema has `type` (text), `metadata` (jsonb), and `status` fields that accommodate this without changes.

---

## New Files Summary

| File | Purpose |
|---|---|
| `src/server/api/routers/agent-communities.ts` | Community agent procedures |
| `src/server/api/routers/agent-feed.ts` | Feed agent procedures |
| `src/app/api/mcp/community-tools.ts` | Community MCP tool registrations |
| `src/app/api/mcp/feed-tools.ts` | Feed MCP tool registrations |

## Modified Files Summary

| File | Change |
|---|---|
| `src/server/api/routers/agent.ts` | Import and spread community/feed routers, add `communitySlug` to 4 existing procedures |
| `src/app/api/mcp/route.ts` | Import and call domain tool modules, bump version to 0.4.0 |
