# Community Admin Features — Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up existing community admin tRPC APIs to the frontend — settings sidebar, member management, invite links, per-community rules, thread moderation, idea status management — and clean up duplicate routes.

**Architecture:** Convert the flat community settings page into a sidebar-navigated layout with sub-pages (general, members, invites, rules). Add backend procedures for gaps (unbanMember, getInviteLinks, updateIdeaStatus, upsertRules). Convert the global CommunityRules Payload singleton to a per-community collection. Add kebab menus to thread cards and idea cards for admin actions.

**Tech Stack:** Next.js 15 App Router, tRPC, Drizzle ORM, Payload CMS 3, shadcn/ui (Tabs, Select, DropdownMenu), next-intl, Tailwind CSS

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/app/[locale]/communities/[slug]/settings/layout.tsx` | Settings layout: access control + sidebar + content area |
| `src/app/[locale]/communities/[slug]/settings/general/page.tsx` | Wraps `<SettingsForm>` |
| `src/app/[locale]/communities/[slug]/settings/members/page.tsx` | Thin page shell for members settings |
| `src/app/[locale]/communities/[slug]/settings/invites/page.tsx` | Thin page shell for invites settings |
| `src/app/[locale]/communities/[slug]/settings/rules/page.tsx` | Thin page shell for rules settings |
| `src/components/communities/settings/settings-sidebar.tsx` | Sidebar nav with active state |
| `src/components/communities/settings/members-settings.tsx` | Member list with tabs (active/pending/banned), role management |
| `src/components/communities/settings/invites-settings.tsx` | Create invite links, list/revoke existing |
| `src/components/communities/settings/rules-settings.tsx` | Community rules editor |

### Modified files
| File | Change |
|------|--------|
| `src/app/[locale]/communities/[slug]/settings/page.tsx` | Convert to redirect to `./general` |
| `src/server/api/routers/communities.ts` | Add `status` param to `getMembers`, add `unbanMember`, `getInviteLinks` |
| `src/server/api/routers/forum.ts` | Add `updateIdeaStatus`, update `getRules`/`acceptRules`/`requireRulesAcceptance` for per-community, add `upsertRules` |
| `src/collections/CommunityRules.ts` | Convert from GlobalConfig to CollectionConfig with `communityId` |
| `src/collections/RulesAcceptance.ts` | Add `communityId` field |
| `src/payload.config.ts` | Move CommunityRules from `globals` to `collections` |
| `src/components/forum/thread-card.tsx` | Add DropdownMenu for pin/lock |
| `src/components/forum/forum-page.tsx` | Accept and pass `memberRole` prop |
| `src/components/forum/thread-detail.tsx` | Fix admin actions to check role instead of authorship, add lock banner |
| `src/app/[locale]/communities/[slug]/forum/page.tsx` | Pass `memberRole` to ForumPage |
| `src/app/[locale]/communities/[slug]/ideas/page.tsx` | Add DropdownMenu for status management |
| `src/components/community/rules-provider.tsx` | Accept `communitySlug`, update queries |
| `messages/en.json` | Add all new translation keys |
| `messages/nl.json` | Add all new translation keys (Dutch) |

### Deleted files
| File | Reason |
|------|--------|
| `src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx` | Duplicate — redirected to settings |
| `src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx` | Duplicate of community settings |
| `src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx` | Moved to community settings/members |

---

## Task 1: Add translation keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add English translations**

Add the following keys inside the `"communities"` object, under a new `"settings"` key. Place it after the existing `"manage"` key (around line 1170):

```json
"settings": {
  "sidebar": {
    "general": "General",
    "members": "Members",
    "invites": "Invites",
    "rules": "Rules",
    "ownership": "Ownership"
  },
  "members": {
    "activeTab": "Active",
    "pendingTab": "Pending",
    "bannedTab": "Banned",
    "changeRole": "Change role",
    "approve": "Approve",
    "reject": "Reject",
    "unban": "Unban",
    "approveConfirm": "Approve this member's request to join?",
    "rejectConfirm": "Reject this member's request to join? This cannot be undone.",
    "unbanConfirm": "Unban this member? They will be able to rejoin the community.",
    "roleChanged": "Role updated",
    "approved": "Member approved",
    "rejected": "Request rejected",
    "unbanned": "Member unbanned",
    "noPending": "No pending requests",
    "noBanned": "No banned members"
  },
  "invites": {
    "title": "Invite Links",
    "create": "Create Invite Link",
    "maxUses": "Max uses",
    "unlimited": "Unlimited",
    "expiresIn": "Expires in",
    "never": "Never",
    "1hour": "1 hour",
    "6hours": "6 hours",
    "1day": "1 day",
    "7days": "7 days",
    "30days": "30 days",
    "linkCopied": "Link copied to clipboard",
    "revoke": "Revoke",
    "revokeConfirm": "Revoke this invite link? It will no longer be usable.",
    "revoked": "Invite revoked",
    "noInvites": "No invite links yet",
    "uses": "{used} / {max}",
    "expired": "Expired",
    "copyLink": "Copy link"
  },
  "rules": {
    "title": "Community Rules",
    "empty": "No rules have been created for this community yet.",
    "create": "Create Rules",
    "publish": "Publish Rules",
    "publishConfirm": "Publishing will increment the version and require all members to re-accept the rules. Continue?",
    "published": "Rules published",
    "addSection": "Add Section",
    "removeSection": "Remove Section",
    "removeSectionConfirm": "Remove this section?",
    "sectionTitle": "Section title",
    "sectionSlug": "Section slug",
    "sectionContent": "Content",
    "sectionIcon": "Icon",
    "currentVersion": "Version {version}",
    "effectiveDate": "Effective since {date}",
    "saveDraft": "Save draft",
    "saved": "Rules saved"
  }
}
```

Also add forum action keys inside the existing `"forum"` object:

```json
"pin": "Pin",
"unpin": "Unpin",
"lock": "Lock",
"unlock": "Unlock",
"threadLocked": "This thread has been locked. No new replies can be added."
```

Also add idea action keys inside the existing `"community.ideas"` object:

```json
"markImplemented": "Mark as Implemented",
"markRejected": "Mark as Rejected",
"reopen": "Reopen",
"statusChanged": "Status updated"
```

- [ ] **Step 2: Add Dutch translations**

Add the same keys to `messages/nl.json` with Dutch translations. Use the same structure. Key translations:
- General = "Algemeen", Members = "Leden", Invites = "Uitnodigingen", Rules = "Regels", Ownership = "Eigenaarschap"
- Approve = "Goedkeuren", Reject = "Afwijzen", Unban = "Deblokkeren"
- Pin = "Vastmaken", Unpin = "Losmaken", Lock = "Vergrendelen", Unlock = "Ontgrendelen"

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(communities): add translation keys for admin settings"
```

---

## Task 2: Backend — update getMembers with status filter and add unbanMember

**Files:**
- Modify: `src/server/api/routers/communities.ts`

- [ ] **Step 1: Add `status` param to `getMembers` input**

In `src/server/api/routers/communities.ts`, find the `getMembers` procedure input (around line 127). Add an optional `status` field:

```typescript
// Inside getMembers input z.object:
status: z.enum(["active", "pending_approval", "banned"]).default("active"),
```

- [ ] **Step 2: Use the status param in the query**

Find the hardcoded `eq(communityMemberships.status, "active")` in the `conditions` array (around line 167). Replace it with:

```typescript
eq(communityMemberships.status, input.status),
```

Also update the unlisted community access check (around line 158) to always check for "active" membership regardless of the queried status:

```typescript
// This check stays as-is — it verifies the REQUESTER is active, not the queried status
```

- [ ] **Step 3: Add `unbanMember` procedure**

Add after the `removeMember` procedure (around line 871):

```typescript
/** Unban a member (deletes the banned row so they can rejoin) */
unbanMember: communityProcedure
  .input(z.object({ slug: z.string(), userId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    if (!ctx.communityRole || ctx.communityRole === "member" || ctx.communityRole === "moderator") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const deleted = await ctx.db
      .delete(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, ctx.community.id),
          eq(communityMemberships.userId, input.userId),
          eq(communityMemberships.status, "banned"),
        ),
      )
      .returning();

    if (deleted.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No banned member found" });
    }

    await logActivity(ctx.db, {
      actorId: ctx.session.user.id,
      actorType: "member",
      action: "community.member_unbanned",
      targetType: "community",
      targetId: ctx.community.id,
      recipientId: input.userId,
    });

    return { success: true };
  }),
```

- [ ] **Step 4: Add `getInviteLinks` query**

Add after `unbanMember`:

```typescript
/** List invite links for a community */
getInviteLinks: communityProcedure
  .input(z.object({ slug: z.string() }))
  .query(async ({ ctx }) => {
    if (!ctx.communityRole || ctx.communityRole === "member" || ctx.communityRole === "moderator") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const invites = await ctx.db
      .select()
      .from(communityInvites)
      .where(eq(communityInvites.communityId, ctx.community.id))
      .orderBy(desc(communityInvites.createdAt));

    return invites;
  }),
```

Note: `desc` is already imported from `drizzle-orm` in this file.

- [ ] **Step 5: Verify with tsc**

```bash
npx tsc --noEmit
```

Expected: no errors related to the communities router.

- [ ] **Step 6: Commit**

```bash
git add src/server/api/routers/communities.ts
git commit -m "feat(communities): add status filter to getMembers, add unbanMember and getInviteLinks"
```

---

## Task 3: Backend — per-community rules (data model + procedures)

**Files:**
- Modify: `src/collections/CommunityRules.ts`
- Modify: `src/collections/RulesAcceptance.ts`
- Modify: `src/payload.config.ts`
- Modify: `src/server/api/routers/forum.ts`

- [ ] **Step 1: Convert CommunityRules from GlobalConfig to CollectionConfig**

Replace the entire content of `src/collections/CommunityRules.ts`:

```typescript
import type { CollectionConfig } from "payload";

export const CommunityRules: CollectionConfig = {
  slug: "community-rules",
  admin: {
    useAsTitle: "communityId",
    defaultColumns: ["communityId", "version", "effectiveDate"],
    description: "Per-community rules / code of conduct.",
  },
  fields: [
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Drizzle community UUID." },
    },
    {
      name: "version",
      type: "number",
      label: "Version",
      required: true,
      defaultValue: 1,
      admin: {
        description:
          "Increment when rules change to require re-acceptance from users.",
      },
    },
    {
      name: "effectiveDate",
      type: "date",
      label: "Effective Date",
      required: true,
      admin: {
        description: "When this version of the rules takes effect.",
        date: {
          pickerAppearance: "dayOnly",
          displayFormat: "d MMM yyyy",
        },
      },
    },
    {
      name: "sections",
      type: "array",
      label: "Sections",
      required: true,
      minRows: 1,
      admin: {
        description: "Structured rule sections with table-of-contents support.",
      },
      fields: [
        {
          name: "title",
          type: "text",
          label: "Title",
          required: true,
          localized: true,
        },
        {
          name: "slug",
          type: "text",
          label: "Slug",
          required: true,
          admin: {
            description:
              "URL-friendly identifier for anchor links (e.g. 'respect-others').",
          },
        },
        {
          name: "icon",
          type: "select",
          label: "Icon",
          options: [
            { label: "Shield", value: "shield" },
            { label: "Users", value: "users" },
            { label: "Flag", value: "flag" },
            { label: "Scale", value: "scale" },
            { label: "Brain", value: "brain" },
            { label: "Gavel", value: "gavel" },
          ],
        },
        {
          name: "content",
          type: "richText",
          label: "Content",
          required: true,
          localized: true,
        },
      ],
    },
  ],
};
```

- [ ] **Step 2: Add communityId to RulesAcceptance**

In `src/collections/RulesAcceptance.ts`, add a `communityId` field after the `rulesVersion` field:

```typescript
{
  name: "communityId",
  type: "text",
  required: true,
  index: true,
  admin: { description: "Drizzle community UUID." },
},
```

- [ ] **Step 3: Update payload.config.ts**

In `src/payload.config.ts`, the `CommunityRules` is currently in the `globals` array (line 94). Move it to the `collections` array and remove the `globals` line:

Remove:
```typescript
globals: [CommunityRules],
```

Add `CommunityRules` to the `collections` array (after `RulesAcceptance`):

```typescript
RulesAcceptance,
CommunityRules,
```

Since `CommunityRules` is already imported, no import changes needed.

- [ ] **Step 4: Update `requireRulesAcceptance` helper in forum.ts**

Replace the `requireRulesAcceptance` function (lines 18-42) with a community-aware version:

```typescript
async function requireRulesAcceptance(userId: string, communityId?: string) {
  if (!communityId) return; // No community context — skip check

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "community-rules",
    where: { communityId: { equals: communityId } },
    limit: 1,
    depth: 0,
  });

  if (docs.length === 0) return; // No rules for this community — skip check

  const rules = docs[0]!;

  const { docs: acceptanceDocs } = await payload.find({
    collection: "rules-acceptance",
    where: {
      and: [
        { userId: { equals: userId } },
        { rulesVersion: { equals: rules.version } },
        { communityId: { equals: communityId } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  if (acceptanceDocs.length === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "RULES_NOT_ACCEPTED",
    });
  }
}
```

- [ ] **Step 5: Update `getRules` procedure**

Replace the `getRules` procedure with:

```typescript
getRules: publicProcedure
  .input(
    z.object({
      communitySlug: z.string(),
      locale: z.enum(["en", "nl"]).optional(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const community = await ctx.db.query.communities.findFirst({
      where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
      columns: { id: true },
    });
    if (!community) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "community-rules",
      where: { communityId: { equals: community.id } },
      locale: input.locale ?? "en",
      limit: 1,
      depth: 0,
    });

    if (docs.length === 0) {
      return { rules: null, hasAccepted: true, acceptedAt: null };
    }

    const rules = docs[0]!;
    const userId = ctx.session?.user?.id;
    let hasAccepted = false;
    let acceptedAt: string | null = null;

    if (userId && rules.version) {
      const { docs: acceptanceDocs } = await payload.find({
        collection: "rules-acceptance",
        where: {
          and: [
            { userId: { equals: userId } },
            { rulesVersion: { equals: rules.version } },
            { communityId: { equals: community.id } },
          ],
        },
        limit: 1,
        depth: 0,
      });
      if (acceptanceDocs.length > 0) {
        hasAccepted = true;
        acceptedAt = acceptanceDocs[0]!.acceptedAt;
      }
    }

    return { rules, hasAccepted, acceptedAt };
  }),
```

- [ ] **Step 6: Update `acceptRules` procedure**

Replace the `acceptRules` procedure with:

```typescript
acceptRules: protectedProcedure
  .input(z.object({ communitySlug: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const community = await ctx.db.query.communities.findFirst({
      where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
      columns: { id: true },
    });
    if (!community) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "community-rules",
      where: { communityId: { equals: community.id } },
      limit: 1,
      depth: 0,
    });

    if (docs.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No rules exist for this community.",
      });
    }

    const rules = docs[0]!;

    const { docs: existing } = await payload.find({
      collection: "rules-acceptance",
      where: {
        and: [
          { userId: { equals: ctx.session.user.id } },
          { rulesVersion: { equals: rules.version } },
          { communityId: { equals: community.id } },
        ],
      },
      limit: 1,
      depth: 0,
    });

    if (existing.length > 0) {
      return { alreadyAccepted: true };
    }

    await payload.create({
      collection: "rules-acceptance",
      data: {
        userId: ctx.session.user.id,
        rulesVersion: rules.version,
        communityId: community.id,
        acceptedAt: new Date().toISOString(),
      },
    });

    return { alreadyAccepted: false };
  }),
```

- [ ] **Step 7: Update all `requireRulesAcceptance` call sites**

In `submitIdea` (around line 183), `toggleVote` (around line 224), `createThread` (around line 394), and `addReply` (around line 456), each calls `await requireRulesAcceptance(ctx.session.user.id)`. Update each to pass the communityId:

For `submitIdea` and `createThread` — the community is resolved within the function. Move the community lookup before the rules check:

```typescript
// In submitIdea - restructure to resolve community first:
let communityId: string | undefined;
if (input.communitySlug) {
  const community = await ctx.db.query.communities.findFirst({
    where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
    columns: { id: true },
  });
  communityId = community?.id;
}
await requireRulesAcceptance(ctx.session.user.id, communityId);
```

For `toggleVote` — the idea has a `communityId`. Fetch the idea first, then pass its communityId:

```typescript
// In toggleVote - look up the idea's communityId:
const idea = await payload.findByID({
  collection: "community-ideas",
  id: input.ideaId,
  depth: 0,
});
await requireRulesAcceptance(ctx.session.user.id, idea.communityId ?? undefined);
```

For `addReply` — the thread has a `communityId`. The thread is already fetched. Pass it:

```typescript
await requireRulesAcceptance(ctx.session.user.id, thread.communityId ?? undefined);
```

- [ ] **Step 8: Add `upsertRules` procedure to forum router**

Add after `lockThread` (end of file):

```typescript
/** Create or update community rules (admin/owner only) */
upsertRules: protectedProcedure
  .input(
    z.object({
      communitySlug: z.string(),
      sections: z.array(
        z.object({
          title: z.string().min(1).max(200),
          slug: z.string().min(1).max(100),
          icon: z.enum(["shield", "users", "flag", "scale", "brain", "gavel"]).optional(),
          content: z.any(), // Rich text JSON
        }),
      ).min(1),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const community = await ctx.db.query.communities.findFirst({
      where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
      columns: { id: true },
    });
    if (!community) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    // Check admin/owner role
    const membership = await ctx.db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.userId, ctx.session.user.id),
        eq(communityMemberships.status, "active"),
      ),
    });
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "community-rules",
      where: { communityId: { equals: community.id } },
      limit: 1,
      depth: 0,
    });

    if (docs.length === 0) {
      // Create new rules document
      const created = await payload.create({
        collection: "community-rules",
        data: {
          communityId: community.id,
          version: 1,
          effectiveDate: new Date().toISOString(),
          sections: input.sections,
        },
      });
      return created;
    }

    // Update existing — increment version
    const existing = docs[0]!;
    const updated = await payload.update({
      collection: "community-rules",
      id: existing.id,
      data: {
        version: (existing.version ?? 0) + 1,
        effectiveDate: new Date().toISOString(),
        sections: input.sections,
      },
    });
    return updated;
  }),
```

Also add the required import for `communityMemberships` at the top of the file:

```typescript
import { user as userTable, communities, communityMemberships } from "@/server/db/schema";
```

- [ ] **Step 9: Add `updateIdeaStatus` procedure to forum router**

Add after `upsertRules`:

```typescript
/** Update idea status (admin/owner only) */
updateIdeaStatus: protectedProcedure
  .input(
    z.object({
      ideaId: z.number(),
      status: z.enum(["open", "implemented", "rejected"]),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const payload = await getPayloadClient();
    const idea = await payload.findByID({
      collection: "community-ideas",
      id: input.ideaId,
      depth: 0,
    });

    if (!idea.communityId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Idea has no community" });
    }

    // Check admin/owner role in the idea's community
    const membership = await ctx.db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, idea.communityId),
        eq(communityMemberships.userId, ctx.session.user.id),
        eq(communityMemberships.status, "active"),
      ),
    });
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await payload.update({
      collection: "community-ideas",
      id: input.ideaId,
      data: { status: input.status },
    });

    return { success: true };
  }),
```

- [ ] **Step 10: Verify with tsc**

```bash
npx tsc --noEmit
```

Expected: no type errors. If Payload types are stale, run `npx payload generate:types` first.

- [ ] **Step 11: Commit**

```bash
git add src/collections/CommunityRules.ts src/collections/RulesAcceptance.ts src/payload.config.ts src/server/api/routers/forum.ts
git commit -m "feat(communities): per-community rules, updateIdeaStatus, upsertRules"
```

---

## Task 4: Settings layout with sidebar

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/settings/page.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/layout.tsx`
- Create: `src/app/[locale]/communities/[slug]/settings/general/page.tsx`
- Create: `src/components/communities/settings/settings-sidebar.tsx`

- [ ] **Step 1: Create the settings sidebar component**

Create `src/components/communities/settings/settings-sidebar.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

interface SettingsSidebarProps {
  slug: string;
  memberRole: "owner" | "admin" | "moderator" | "member";
}

interface NavItem {
  key: string;
  href: string;
  ownerOnly?: boolean;
}

export function SettingsSidebar({ slug, memberRole }: SettingsSidebarProps) {
  const t = useTranslations("communities.settings.sidebar");
  const pathname = usePathname();

  const basePath = `/communities/${slug}/settings`;

  const items: NavItem[] = [
    { key: "general", href: `${basePath}/general` },
    { key: "members", href: `${basePath}/members` },
    { key: "invites", href: `${basePath}/invites` },
    { key: "rules", href: `${basePath}/rules` },
    { key: "ownership", href: `${basePath}/ownership`, ownerOnly: true },
  ];

  const visibleItems = items.filter(
    (item) => !item.ownerOnly || memberRole === "owner",
  );

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden w-48 shrink-0 space-y-1 md:block">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href as never}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
            >
              {t(item.key as "general" | "members" | "invites" | "rules" | "ownership")}
            </Link>
          );
        })}
      </nav>

      {/* Mobile horizontal tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b pb-2 md:hidden">
        {visibleItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href as never}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(item.key as "general" | "members" | "invites" | "rules" | "ownership")}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Create the settings layout**

Create `src/app/[locale]/communities/[slug]/settings/layout.tsx`:

```tsx
"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { SettingsSidebar } from "@/components/communities/settings/settings-sidebar";

export default function CommunitySettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.manage");

  const { data: myCommunities, isLoading } =
    api.communities.getMyCommunities.useQuery();

  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const isAdminOrOwner =
    myMembership?.role === "owner" || myMembership?.role === "admin";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!isAdminOrOwner || !myMembership) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">{t("accessDenied")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <SettingsSidebar
        slug={slug}
        memberRole={myMembership.role as "owner" | "admin" | "moderator" | "member"}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Convert existing settings page to redirect**

Replace the entire content of `src/app/[locale]/communities/[slug]/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default async function CommunitySettingsPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  redirect(`/${locale}/communities/${slug}/settings/general`);
}
```

- [ ] **Step 4: Create the general settings page**

Create `src/app/[locale]/communities/[slug]/settings/general/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { SettingsForm } from "@/components/communities/manage/settings-form";
import { Spinner } from "@/components/ui/spinner";

export default function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("communities.manage");

  const { data: community, isLoading } = api.communities.getBySlug.useQuery({
    slug,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t("settings")}
        </h2>
        <p className="text-muted-foreground text-sm">{community.name}</p>
      </div>
      <SettingsForm
        key={slug}
        slug={slug}
        initialData={{
          name: community.name,
          description: community.description,
          logoUrl: community.logoUrl,
          joinPolicy: community.joinPolicy,
          isListedInDirectory: community.isListedInDirectory,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/communities/[slug]/settings/ src/components/communities/settings/settings-sidebar.tsx
git commit -m "feat(communities): settings layout with sidebar navigation"
```

---

## Task 5: Members settings page

**Files:**
- Create: `src/app/[locale]/communities/[slug]/settings/members/page.tsx`
- Create: `src/components/communities/settings/members-settings.tsx`

- [ ] **Step 1: Create the members settings component**

Create `src/components/communities/settings/members-settings.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MembersSettingsProps {
  slug: string;
  joinPolicy: "open" | "invite_only" | "approval_required";
  myRole: "owner" | "admin" | "moderator" | "member";
}

export function MembersSettings({ slug, joinPolicy, myRole }: MembersSettingsProps) {
  const t = useTranslations("communities.settings.members");
  const tRoles = useTranslations("communities.roles");
  const tManage = useTranslations("communities.manage");
  const utils = api.useUtils();
  const { data: session } = authClient.useSession();

  const { data: activeData, isLoading: activeLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 50, status: "active" });

  const { data: pendingData, isLoading: pendingLoading } =
    api.communities.getMembers.useQuery(
      { slug, limit: 50, status: "pending_approval" },
      { enabled: joinPolicy === "approval_required" },
    );

  const { data: bannedData, isLoading: bannedLoading } =
    api.communities.getMembers.useQuery({ slug, limit: 50, status: "banned" });

  const setRoleMutation = api.communities.setMemberRole.useMutation({
    onSuccess: () => {
      toast.success(t("roleChanged"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const approveMutation = api.communities.approveRequest.useMutation({
    onSuccess: () => {
      toast.success(t("approved"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const rejectMutation = api.communities.rejectRequest.useMutation({
    onSuccess: () => {
      toast.success(t("rejected"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const removeMutation = api.communities.removeMember.useMutation({
    onSuccess: () => {
      toast.success(tManage("memberRemoved"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const banMutation = api.communities.banMember.useMutation({
    onSuccess: () => {
      toast.success(tManage("memberBanned"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const unbanMutation = api.communities.unbanMember.useMutation({
    onSuccess: () => {
      toast.success(t("unbanned"));
      void utils.communities.getMembers.invalidate();
    },
  });

  const activeMembers = activeData?.items ?? [];
  const pendingMembers = pendingData?.items ?? [];
  const bannedMembers = bannedData?.items ?? [];

  const canManage = (targetRole: string) => {
    if (myRole === "owner") return targetRole !== "owner";
    if (myRole === "admin") return targetRole === "moderator" || targetRole === "member";
    return false;
  };

  const availableRoles = () => {
    if (myRole === "owner") return ["admin", "moderator", "member"] as const;
    if (myRole === "admin") return ["moderator", "member"] as const;
    return [] as const;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {tManage("members")}
        </h2>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            {t("activeTab")} ({activeMembers.length})
          </TabsTrigger>
          {joinPolicy === "approval_required" && (
            <TabsTrigger value="pending">
              {t("pendingTab")} ({pendingMembers.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="banned">
            {t("bannedTab")} ({bannedMembers.length})
          </TabsTrigger>
        </TabsList>

        {/* Active members */}
        <TabsContent value="active">
          {activeLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : activeMembers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {tManage("noMembers")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {activeMembers.map((member) => {
                const isSelf = member.userId === session?.user?.id;
                const showActions = !isSelf && canManage(member.role);

                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {member.image ? (
                          <AvatarImage
                            src={member.image}
                            alt={member.displayName ?? ""}
                          />
                        ) : null}
                        <AvatarFallback>
                          {(member.displayName ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.displayName ?? "Member"}
                        </p>
                        <Badge variant="secondary" className="mt-0.5 text-xs">
                          {tRoles(member.role)}
                        </Badge>
                      </div>
                    </div>

                    {showActions && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            setRoleMutation.mutate({
                              slug,
                              userId: member.userId,
                              role: role as "admin" | "moderator" | "member",
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableRoles().map((r) => (
                              <SelectItem key={r} value={r}>
                                {tRoles(r)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (window.confirm(tManage("removeConfirm"))) {
                              removeMutation.mutate({ slug, userId: member.userId });
                            }
                          }}
                        >
                          {tManage("remove")}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={banMutation.isPending}
                          onClick={() => {
                            if (window.confirm(tManage("banConfirm"))) {
                              banMutation.mutate({ slug, userId: member.userId });
                            }
                          }}
                        >
                          {tManage("ban")}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Pending members */}
        {joinPolicy === "approval_required" && (
          <TabsContent value="pending">
            {pendingLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : pendingMembers.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {t("noPending")}
              </p>
            ) : (
              <div className="divide-y rounded-lg border">
                {pendingMembers.map((member) => (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        {member.image ? (
                          <AvatarImage
                            src={member.image}
                            alt={member.displayName ?? ""}
                          />
                        ) : null}
                        <AvatarFallback>
                          {(member.displayName ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.displayName ?? "Member"}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending}
                        onClick={() => {
                          if (window.confirm(t("approveConfirm"))) {
                            approveMutation.mutate({ slug, userId: member.userId });
                          }
                        }}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          t("approve")
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={rejectMutation.isPending}
                        onClick={() => {
                          if (window.confirm(t("rejectConfirm"))) {
                            rejectMutation.mutate({ slug, userId: member.userId });
                          }
                        }}
                      >
                        {rejectMutation.isPending ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          t("reject")
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* Banned members */}
        <TabsContent value="banned">
          {bannedLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : bannedMembers.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              {t("noBanned")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {bannedMembers.map((member) => (
                <div
                  key={member.userId}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      {member.image ? (
                        <AvatarImage
                          src={member.image}
                          alt={member.displayName ?? ""}
                        />
                      ) : null}
                      <AvatarFallback>
                        {(member.displayName ?? "?")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {member.displayName ?? "Member"}
                      </p>
                      <Badge variant="destructive" className="mt-0.5 text-xs">
                        Banned
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unbanMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t("unbanConfirm"))) {
                        unbanMutation.mutate({ slug, userId: member.userId });
                      }
                    }}
                  >
                    {unbanMutation.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      t("unban")
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Create the members settings page**

Create `src/app/[locale]/communities/[slug]/settings/members/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Spinner } from "@/components/ui/spinner";
import { MembersSettings } from "@/components/communities/settings/members-settings";

export default function MembersSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const { data: community, isLoading: communityLoading } =
    api.communities.getBySlug.useQuery({ slug });

  const { data: myCommunities, isLoading: roleLoading } =
    api.communities.getMyCommunities.useQuery();

  if (communityLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  if (!community) return null;

  const myMembership = myCommunities?.find((c) => c.slug === slug);

  return (
    <MembersSettings
      slug={slug}
      joinPolicy={community.joinPolicy}
      myRole={(myMembership?.role as "owner" | "admin") ?? "member"}
    />
  );
}
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/communities/[slug]/settings/members/ src/components/communities/settings/members-settings.tsx
git commit -m "feat(communities): member management settings page"
```

---

## Task 6: Invites settings page

**Files:**
- Create: `src/app/[locale]/communities/[slug]/settings/invites/page.tsx`
- Create: `src/components/communities/settings/invites-settings.tsx`

- [ ] **Step 1: Create the invites settings component**

Create `src/components/communities/settings/invites-settings.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface InvitesSettingsProps {
  slug: string;
}

const EXPIRY_OPTIONS = [
  { value: "never", days: undefined },
  { value: "1day", days: 1 },
  { value: "7days", days: 7 },
  { value: "30days", days: 30 },
] as const;

export function InvitesSettings({ slug }: InvitesSettingsProps) {
  const t = useTranslations("communities.settings.invites");
  const utils = api.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [maxUses, setMaxUses] = useState("");
  const [expiresIn, setExpiresIn] = useState("never");
  const [lastCreatedCode, setLastCreatedCode] = useState<string | null>(null);

  const { data: invites = [], isLoading } =
    api.communities.getInviteLinks.useQuery({ slug });

  const createMutation = api.communities.createInviteLink.useMutation({
    onSuccess: (data) => {
      setLastCreatedCode(data.code);
      setShowForm(false);
      setMaxUses("");
      setExpiresIn("never");
      void utils.communities.getInviteLinks.invalidate();
    },
  });

  const revokeMutation = api.communities.revokeInviteLink.useMutation({
    onSuccess: () => {
      toast.success(t("revoked"));
      void utils.communities.getInviteLinks.invalidate();
    },
  });

  const handleCreate = () => {
    const option = EXPIRY_OPTIONS.find((o) => o.value === expiresIn);
    createMutation.mutate({
      slug,
      maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
      expiresInDays: option?.days,
    });
  };

  const copyLink = (code: string) => {
    const link = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(link);
    toast.success(t("linkCopied"));
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  const isMaxedOut = (useCount: number, maxUses: number | null) => {
    if (maxUses === null) return false;
    return useCount >= maxUses;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="mr-1.5 size-3.5" />
            {t("create")}
          </Button>
        )}
      </div>

      {/* Last created link */}
      {lastCreatedCode && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
          <Input
            readOnly
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/invite/${lastCreatedCode}`}
            className="flex-1 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => copyLink(lastCreatedCode)}
          >
            <Copy className="mr-1.5 size-3.5" />
            {t("copyLink")}
          </Button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label>{t("maxUses")}</Label>
            <Input
              type="number"
              min={1}
              placeholder={t("unlimited")}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("expiresIn")}</Label>
            <Select value={expiresIn} onValueChange={setExpiresIn}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">{t("never")}</SelectItem>
                <SelectItem value="1day">{t("1day")}</SelectItem>
                <SelectItem value="7days">{t("7days")}</SelectItem>
                <SelectItem value="30days">{t("30days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              {t("create")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Invite list */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : invites.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {t("noInvites")}
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {invites.map((invite) => {
            const expired = isExpired(invite.expiresAt?.toString() ?? null);
            const maxedOut = isMaxedOut(invite.useCount, invite.maxUses);
            const inactive = expired || maxedOut;

            return (
              <div
                key={invite.id}
                className={`flex items-center justify-between gap-4 p-4 ${inactive ? "opacity-50" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{invite.code}</code>
                    {inactive && (
                      <span className="text-xs text-destructive font-medium">
                        {expired ? t("expired") : t("unlimited")}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {invite.useCount} / {invite.maxUses ?? "∞"} uses
                    {invite.expiresAt && !expired && (
                      <> · Expires {new Date(invite.expiresAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!inactive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLink(invite.code)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={revokeMutation.isPending}
                    onClick={() => {
                      if (window.confirm(t("revokeConfirm"))) {
                        revokeMutation.mutate({ slug, inviteId: invite.id });
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the invites settings page**

Create `src/app/[locale]/communities/[slug]/settings/invites/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { InvitesSettings } from "@/components/communities/settings/invites-settings";

export default function InvitesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <InvitesSettings slug={slug} />;
}
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/communities/[slug]/settings/invites/ src/components/communities/settings/invites-settings.tsx
git commit -m "feat(communities): invite link management settings page"
```

---

## Task 7: Rules settings page

**Files:**
- Create: `src/app/[locale]/communities/[slug]/settings/rules/page.tsx`
- Create: `src/components/communities/settings/rules-settings.tsx`

- [ ] **Step 1: Create the rules settings component**

Create `src/components/communities/settings/rules-settings.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface RulesSettingsProps {
  slug: string;
}

interface RuleSection {
  title: string;
  slug: string;
  icon?: string;
  content: unknown; // Rich text or plain text
}

const ICON_OPTIONS = [
  { label: "Shield", value: "shield" },
  { label: "Users", value: "users" },
  { label: "Flag", value: "flag" },
  { label: "Scale", value: "scale" },
  { label: "Brain", value: "brain" },
  { label: "Gavel", value: "gavel" },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function RulesSettings({ slug }: RulesSettingsProps) {
  const t = useTranslations("communities.settings.rules");
  const utils = api.useUtils();

  const { data: rulesData, isLoading } = api.forum.getRules.useQuery({
    communitySlug: slug,
  });

  const [sections, setSections] = useState<RuleSection[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize sections from fetched rules
  useEffect(() => {
    if (rulesData?.rules && !initialized) {
      const ruleSections = (rulesData.rules as { sections?: RuleSection[] }).sections;
      if (ruleSections) {
        setSections(
          ruleSections.map((s) => ({
            title: s.title ?? "",
            slug: s.slug ?? "",
            icon: s.icon ?? undefined,
            content: s.content ?? "",
          })),
        );
      }
      setInitialized(true);
    } else if (rulesData && !rulesData.rules && !initialized) {
      setInitialized(true);
    }
  }, [rulesData, initialized]);

  const upsertMutation = api.forum.upsertRules.useMutation({
    onSuccess: () => {
      toast.success(t("published"));
      void utils.forum.getRules.invalidate();
    },
  });

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { title: "", slug: "", icon: undefined, content: "" },
    ]);
  };

  const removeSection = (index: number) => {
    if (window.confirm(t("removeSectionConfirm"))) {
      setSections((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updateSection = (index: number, updates: Partial<RuleSection>) => {
    setSections((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, ...updates };
        // Auto-generate slug from title if slug is empty or was auto-generated
        if (updates.title !== undefined && (s.slug === "" || s.slug === slugify(s.title))) {
          updated.slug = slugify(updates.title);
        }
        return updated;
      }),
    );
  };

  const moveSection = (from: number, to: number) => {
    setSections((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved!);
      return copy;
    });
  };

  const handlePublish = () => {
    if (sections.length === 0) return;
    const hasEmpty = sections.some((s) => !s.title.trim());
    if (hasEmpty) {
      toast.error("All sections must have a title");
      return;
    }

    if (rulesData?.rules) {
      if (!window.confirm(t("publishConfirm"))) return;
    }

    upsertMutation.mutate({
      communitySlug: slug,
      sections: sections.map((s) => ({
        title: s.title,
        slug: s.slug || slugify(s.title),
        icon: (s.icon as "shield" | "users" | "flag" | "scale" | "brain" | "gavel" | undefined),
        content: typeof s.content === "string" ? s.content : s.content,
      })),
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasRules = !!rulesData?.rules;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          {hasRules && (
            <p className="text-muted-foreground text-sm">
              {t("currentVersion", { version: (rulesData.rules as { version?: number }).version ?? 1 })}
              {" · "}
              {t("effectiveDate", {
                date: new Date(
                  (rulesData.rules as { effectiveDate?: string }).effectiveDate ?? "",
                ).toLocaleDateString(),
              })}
            </p>
          )}
        </div>
      </div>

      {!hasRules && sections.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground text-sm mb-4">{t("empty")}</p>
          <Button onClick={addSection}>
            <Plus className="mr-1.5 size-3.5" />
            {t("create")}
          </Button>
        </div>
      ) : (
        <>
          {/* Sections editor */}
          <div className="space-y-4">
            {sections.map((section, index) => (
              <div key={index} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                    <span className="text-xs text-muted-foreground font-mono">
                      #{index + 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveSection(index, index - 1)}
                      >
                        ↑
                      </Button>
                    )}
                    {index < sections.length - 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => moveSection(index, index + 1)}
                      >
                        ↓
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeSection(index)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("sectionTitle")}</Label>
                    <Input
                      value={section.title}
                      onChange={(e) =>
                        updateSection(index, { title: e.target.value })
                      }
                      placeholder={t("sectionTitle")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("sectionIcon")}</Label>
                    <Select
                      value={section.icon ?? ""}
                      onValueChange={(v) =>
                        updateSection(index, { icon: v || undefined })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select icon" />
                      </SelectTrigger>
                      <SelectContent>
                        {ICON_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{t("sectionSlug")}</Label>
                  <Input
                    value={section.slug}
                    onChange={(e) =>
                      updateSection(index, { slug: e.target.value })
                    }
                    placeholder="auto-generated-from-title"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">{t("sectionContent")}</Label>
                  <Textarea
                    value={typeof section.content === "string" ? section.content : ""}
                    onChange={(e) =>
                      updateSection(index, { content: e.target.value })
                    }
                    placeholder={t("sectionContent")}
                    rows={4}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="mr-1.5 size-3.5" />
              {t("addSection")}
            </Button>
            <Button
              size="sm"
              onClick={handlePublish}
              disabled={upsertMutation.isPending || sections.length === 0}
            >
              {upsertMutation.isPending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : null}
              {t("publish")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the rules settings page**

Create `src/app/[locale]/communities/[slug]/settings/rules/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { RulesSettings } from "@/components/communities/settings/rules-settings";

export default function RulesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <RulesSettings slug={slug} />;
}
```

- [ ] **Step 3: Update rules-provider.tsx for per-community rules**

Replace the content of `src/components/community/rules-provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { RulesModal } from "@/components/community/modals/rules-modal";
import { useTranslations } from "next-intl";

type RulesContextValue = {
  openRulesModal: () => void;
  communitySlug?: string;
};

const RulesContext = createContext<RulesContextValue>({
  openRulesModal: () => undefined,
});

export function useRulesModal() {
  return useContext(RulesContext);
}

interface RulesProviderProps {
  children: React.ReactNode;
  communitySlug?: string;
}

export function RulesProvider({ children, communitySlug }: RulesProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("community.rules");

  const openRulesModal = useCallback(() => setIsOpen(true), []);

  return (
    <RulesContext.Provider value={{ openRulesModal, communitySlug }}>
      {children}
      <RulesModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={t("title")}
        subtitle={t("subtitle")}
      />
    </RulesContext.Provider>
  );
}
```

- [ ] **Step 4: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/communities/[slug]/settings/rules/ src/components/communities/settings/rules-settings.tsx src/components/community/rules-provider.tsx
git commit -m "feat(communities): rules editor settings page with per-community support"
```

---

## Task 8: Forum thread moderation — kebab menu

**Files:**
- Modify: `src/components/forum/thread-card.tsx`
- Modify: `src/components/forum/forum-page.tsx`
- Modify: `src/components/forum/thread-detail.tsx`
- Modify: `src/app/[locale]/communities/[slug]/forum/page.tsx`

- [ ] **Step 1: Add memberRole prop to ForumPage and pass to ThreadCard**

In `src/components/forum/forum-page.tsx`, update the interface (line 17-19):

```typescript
interface ForumPageProps {
  communitySlug?: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function ForumPage({ communitySlug, memberRole }: ForumPageProps) {
```

Update the ThreadCard rendering (around line 161):

```tsx
<ThreadCard key={thread.id} thread={thread} index={i} memberRole={memberRole} />
```

- [ ] **Step 2: Add kebab menu to ThreadCard**

In `src/components/forum/thread-card.tsx`, add imports:

```typescript
import { MoreHorizontal, Pin, Lock } from "lucide-react";
import { api } from "@/trpc/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

Update the props type:

```typescript
type ThreadCardProps = {
  thread: ForumThread;
  index: number;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
};
```

Update the component signature:

```typescript
export function ThreadCard({ thread, index, memberRole }: ThreadCardProps) {
```

Add mutations and the menu inside the component, after the `const t = ...` line:

```typescript
const utils = api.useUtils();
const canModerate = memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";

const pinMutation = api.forum.pinThread.useMutation({
  onSuccess: () => void utils.forum.getThreads.invalidate(),
});
const lockMutation = api.forum.lockThread.useMutation({
  onSuccess: () => void utils.forum.getThreads.invalidate(),
});
```

In the JSX, add after the category badge span (inside the `items-start justify-between` div), add a lock indicator and the kebab menu:

```tsx
<div className="flex shrink-0 items-center gap-1.5">
  {thread.isLocked && (
    <Lock className="h-3 w-3 text-zinc-400" />
  )}
  <span
    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${categoryStyles[thread.category]}`}
  >
    {t(thread.category)}
  </span>
  {canModerate && (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded p-1 hover:bg-zinc-100"
        onClick={(e) => e.preventDefault()}
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            pinMutation.mutate({ threadId: thread.id, isPinned: !thread.isPinned });
          }}
        >
          <Pin className="mr-2 h-3.5 w-3.5" />
          {thread.isPinned ? t("unpinThread") : t("pinThread")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            lockMutation.mutate({ threadId: thread.id, isLocked: !thread.isLocked });
          }}
        >
          <Lock className="mr-2 h-3.5 w-3.5" />
          {thread.isLocked ? t("unlockThread") : t("lockThread")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )}
</div>
```

Remove the old standalone category badge span that this replaces.

- [ ] **Step 3: Update thread-detail.tsx admin actions**

In `src/components/forum/thread-detail.tsx`, the current admin actions check `isAuthor` (line 157). Change to check community role instead. Add a `memberRole` prop:

```typescript
type ThreadDetailProps = {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
};

export function ThreadDetail({ slug, memberRole }: ThreadDetailProps) {
```

Replace `isAuthor` usage for admin buttons (around line 157) with:

```typescript
const canModerate = memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";
```

Change `{isAuthor && (` to `{canModerate && (` on line 157.

Add a locked banner before the thread content (around line 185):

```tsx
{thread.isLocked && (
  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700">
    {t("threadLocked")}
  </div>
)}
```

Add the `threadLocked` translation key to the forum translations (already added in Task 1).

- [ ] **Step 4: Pass memberRole from community forum page**

Read and update `src/app/[locale]/communities/[slug]/forum/page.tsx` to pass `memberRole`:

```tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { ForumPage } from "@/components/forum/forum-page";

export default function CommunityForumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: session } = authClient.useSession();

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );

  const membership = myCommunities?.find((c) => c.slug === slug);
  const memberRole = membership?.status === "active" ? membership.role : null;

  return (
    <ForumPage
      communitySlug={slug}
      memberRole={memberRole as "owner" | "admin" | "moderator" | "member" | null}
    />
  );
}
```

- [ ] **Step 5: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/components/forum/thread-card.tsx src/components/forum/forum-page.tsx src/components/forum/thread-detail.tsx src/app/[locale]/communities/[slug]/forum/page.tsx
git commit -m "feat(communities): thread moderation kebab menu for pin/lock"
```

---

## Task 9: Idea status management — kebab menu

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/ideas/page.tsx`

- [ ] **Step 1: Add role check and kebab menu to ideas page**

In `src/app/[locale]/communities/[slug]/ideas/page.tsx`, add imports:

```typescript
import { ChevronUp, Lightbulb, MoreHorizontal, Check, X, RotateCcw } from "lucide-react";
import { api } from "@/trpc/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

Add the membership role check inside the component (after session check):

```typescript
const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
  undefined,
  { enabled: !!session?.user },
);
const membership = myCommunities?.find((c) => c.slug === slug);
const isAdminOrOwner = membership?.role === "owner" || membership?.role === "admin";
```

Add the status mutation:

```typescript
const statusMutation = api.forum.updateIdeaStatus.useMutation({
  onSuccess: () => {
    void utils.forum.getIdeas.invalidate();
    toast.success(t("statusChanged"));
  },
});
```

In the idea card JSX, add a kebab menu after the status badge (inside the `min-w-0 flex-1` div, after the status span):

```tsx
<div className="mt-1 flex items-center gap-2">
  <span
    className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${statusStyles[idea.status]}`}
  >
    {idea.status === "open"
      ? t("statusOpen")
      : idea.status === "implemented"
        ? t("statusImplemented")
        : t("statusRejected")}
  </span>
  {isAdminOrOwner && (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded p-0.5 hover:bg-zinc-100">
        <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {idea.status !== "implemented" && (
          <DropdownMenuItem
            onClick={() =>
              statusMutation.mutate({ ideaId: idea.id, status: "implemented" })
            }
          >
            <Check className="mr-2 h-3.5 w-3.5" />
            {t("markImplemented")}
          </DropdownMenuItem>
        )}
        {idea.status !== "rejected" && (
          <DropdownMenuItem
            onClick={() =>
              statusMutation.mutate({ ideaId: idea.id, status: "rejected" })
            }
          >
            <X className="mr-2 h-3.5 w-3.5" />
            {t("markRejected")}
          </DropdownMenuItem>
        )}
        {idea.status !== "open" && (
          <DropdownMenuItem
            onClick={() =>
              statusMutation.mutate({ ideaId: idea.id, status: "open" })
            }
          >
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            {t("reopen")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )}
</div>
```

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/communities/[slug]/ideas/page.tsx
git commit -m "feat(communities): idea status management kebab menu for admins"
```

---

## Task 10: Route cleanup — delete duplicate manage pages

**Files:**
- Delete: `src/app/[locale]/dashboard/communities/[slug]/manage/settings/page.tsx`
- Delete: `src/app/[locale]/dashboard/communities/[slug]/manage/members/page.tsx`
- Delete: `src/app/[locale]/dashboard/communities/[slug]/manage/page.tsx`

- [ ] **Step 1: Delete the manage directory and its contents**

```bash
rm -rf src/app/\[locale\]/dashboard/communities/\[slug\]/manage/
```

- [ ] **Step 2: Verify no broken imports**

```bash
npx tsc --noEmit
```

Grep for any remaining references to the deleted routes:

```bash
grep -r "manage/settings\|manage/members\|/manage" src/app/ src/components/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v ".next"
```

If the dashboard page (`src/app/[locale]/dashboard/communities/page.tsx`) references `/manage/`, update it. Based on current code, it already links to `/communities/${m.slug}/settings` so no change should be needed.

- [ ] **Step 3: Commit**

```bash
git add -A src/app/[locale]/dashboard/communities/[slug]/manage/
git commit -m "chore(communities): remove duplicate manage routes"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run tsc**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Verify the app builds**

```bash
pnpm build
```

If there are Payload type errors, regenerate types first:

```bash
npx payload generate:types
```

Then rebuild.

- [ ] **Step 3: Manual smoke test checklist**

- Navigate to a community as owner → Settings tab → verify sidebar appears
- General settings → verify existing form works
- Members tab → verify active/pending/banned tabs
- Invites tab → create a link, copy it, revoke it
- Rules tab → create rules with a section, publish
- Forum → verify kebab menu appears on thread cards (as admin/owner)
- Ideas → verify kebab menu appears on idea cards (as admin/owner)
- Try changing a member's role
- Try approving/rejecting a pending member (on an approval-required community)
- Try banning and unbanning a member

- [ ] **Step 4: Commit any fixes**

If any fixes were needed during verification, commit them as a separate fix commit.
