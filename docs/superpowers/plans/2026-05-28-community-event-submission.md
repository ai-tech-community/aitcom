# Community Event Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any active community member to submit an event for publication; admins/moderators approve or reject it; approved events appear on the global events page with a community badge.

**Architecture:** New `submitEvent` tRPC procedure creates events as `draft` (instead of `published`); admins see a "Pending" tab on the community events page with approve/reject actions; a Payload migration adds `rejected` to the status enum and a `submitted_by` column; the global events page batch-fetches community metadata and renders a badge on community-sourced events.

**Tech Stack:** Payload CMS (`@payloadcms/db-postgres` for migrations), Drizzle ORM (app schema), tRPC v11, Next.js App Router, shadcn/ui, better-auth

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/migrations/20260528_event_submission.ts` | **Create** | Add `rejected` enum value + `submitted_by` column to events + _events_v |
| `src/migrations/index.ts` | **Modify** | Register new migration |
| `src/collections/Events.ts` | **Modify** | Add `rejected` option to status; add `submittedBy` sidebar field |
| `src/server/api/routers/events.ts` | **Modify** | New procedures: `submitEvent`, `getPendingCommunityEvents`, `getMyEventSubmissions`, `approveEvent`, `rejectEvent` |
| `src/components/communities/event-form-dialog.tsx` | **Modify** | Add `isAdminOrOwner` prop to hide internal fields; change submit label for members |
| `src/app/[locale]/communities/[slug]/events/page.tsx` | **Modify** | Submit button for all active members; Pending tab + approve/reject for admins/mods |
| `src/app/[locale]/events/page.tsx` | **Modify** | Community badge on event cards |

---

## Task 1: Payload migration — `rejected` status + `submitted_by` column

**Files:**
- Create: `src/migrations/20260528_event_submission.ts`
- Modify: `src/migrations/index.ts`

- [ ] **Step 1: Create the migration file**

```ts
// src/migrations/20260528_event_submission.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Add 'rejected' to the events status enum (safe: ADD VALUE is non-transactional in PG)
    DO $$ BEGIN
      ALTER TYPE "public"."enum_events_status" ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum__events_v_version_status" ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- submitted_by stores the app.user.id of the community member who submitted the event
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "submitted_by" varchar;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_submitted_by" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    -- Postgres does not support removing enum values; leave enum intact
    ALTER TABLE "events" DROP COLUMN IF EXISTS "submitted_by";
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_submitted_by";
  `);
}
```

- [ ] **Step 2: Register the migration in index.ts**

Open `src/migrations/index.ts`. After the last import and the last entry in the `migrations` array, add:

```ts
// At top with other imports:
import * as migration_20260528_event_submission from "./20260528_event_submission";

// In the migrations array, after the last entry:
  {
    up: migration_20260528_event_submission.up,
    down: migration_20260528_event_submission.down,
    name: "20260528_event_submission",
  },
```

- [ ] **Step 3: Apply the migration**

```bash
pnpm payload migrate
```

Expected: output ends with `Migration 20260528_event_submission applied successfully` (or similar).

- [ ] **Step 4: Commit**

```bash
git add src/migrations/20260528_event_submission.ts src/migrations/index.ts
git commit -m "feat(events): add rejected status and submitted_by column via migration"
```

---

## Task 2: Update Events collection definition

**Files:**
- Modify: `src/collections/Events.ts`

- [ ] **Step 1: Add `rejected` to the status select options**

In `src/collections/Events.ts`, find the `status` field (around line 325). The current options are:
```ts
options: [
  { label: "Draft", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Completed", value: "completed" },
],
```

Change to:
```ts
options: [
  { label: "Draft (pending approval)", value: "draft" },
  { label: "Published", value: "published" },
  { label: "Rejected", value: "rejected" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Completed", value: "completed" },
],
```

- [ ] **Step 2: Add `submittedBy` field as a sidebar field**

In `src/collections/Events.ts`, after the `communityId` field definition (around line 339), add:

```ts
    {
      name: "submittedBy",
      type: "text",
      index: true,
      admin: {
        position: "sidebar",
        description: "User ID of the community member who submitted this event for review.",
        readOnly: true,
      },
    },
```

- [ ] **Step 3: Verify the app compiles**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/collections/Events.ts
git commit -m "feat(events): add rejected status option and submittedBy field to Events collection"
```

---

## Task 3: New tRPC procedures in events router

**Files:**
- Modify: `src/server/api/routers/events.ts`

Add five new procedures to the `eventsRouter`. Open `src/server/api/routers/events.ts`.

- [ ] **Step 1: Add imports needed**

At the top of the file, the `communityMemberships` and `communities` imports already exist. Add `notifications` and `inArray` to the existing import blocks:

```ts
// Add to existing drizzle import:
import { eq, and, isNull, sql, asc, inArray } from "drizzle-orm";

// Add notifications to the schema import:
import {
  eventRegistrations,
  memberProfiles,
  user,
  communities,
  communityMemberships,
  communityLumaIntegrations,
  notifications,
} from "@/server/db/schema";
```

- [ ] **Step 2: Add `submitEvent` procedure**

Add this procedure inside `eventsRouter`, after the `cancelEvent` procedure (before the closing `}`):

```ts
  submitEvent: protectedProcedure
    .input(
      z.object({ communitySlug: z.string() }).extend(eventUpsertSchema.shape),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You must be an active community member to submit events",
        });
      }

      const baseSlug = input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
      const slug = `${baseSlug}-${Date.now()}`;

      const payload = await getPayloadClient();
      const event = await payload.create({
        collection: "events",
        data: {
          slug,
          status: "draft",
          communityId: community.id,
          submittedBy: userId,
          ...buildEventPayloadData(input),
        },
      });

      // Notify all admins/owners/moderators of this community
      const admins = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
            sql`${communityMemberships.role} IN ('owner', 'admin', 'moderator')`,
          ),
        );

      if (admins.length > 0) {
        await ctx.db.insert(notifications).values(
          admins.map(({ userId: adminId }) => ({
            userId: adminId,
            type: "event_submitted",
            title: "New event pending approval",
            content: `"${input.title}" was submitted for review in ${community.name}.`,
            metadata: {
              eventId: String(event.id),
              communitySlug: input.communitySlug,
            },
            communityId: community.id,
          })),
        );
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.submit",
        targetType: "event",
        targetId: String(event.id),
        metadata: { title: input.title, communitySlug: input.communitySlug },
      });

      return event;
    }),
```

- [ ] **Step 3: Add `getPendingCommunityEvents` procedure**

```ts
  getPendingCommunityEvents: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true, name: true },
      });
      if (!community) return [];

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" &&
          membership.role !== "admin" &&
          membership.role !== "moderator")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins and moderators can view pending events",
        });
      }

      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { status: { equals: "draft" } },
            { communityId: { equals: community.id } },
          ],
        },
        sort: "createdAt",
        draft: false,
      });

      return docs.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        type: e.type,
        date: e.date,
        location: e.location,
        status: e.status,
        submittedBy: (e.submittedBy as string | null | undefined) ?? null,
        communityId: community.id,
      }));
    }),
```

- [ ] **Step 4: Add `getMyEventSubmissions` procedure**

```ts
  getMyEventSubmissions: protectedProcedure
    .input(z.object({ communitySlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
        columns: { id: true },
      });
      if (!community) return [];

      const payload = await getPayloadClient();
      const { docs } = await payload.find({
        collection: "events",
        where: {
          and: [
            { submittedBy: { equals: userId } },
            { communityId: { equals: community.id } },
            {
              or: [
                { status: { equals: "draft" } },
                { status: { equals: "rejected" } },
              ],
            },
          ],
        },
        sort: "createdAt",
        draft: false,
      });

      return docs.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        type: e.type,
        date: e.date,
        location: e.location,
        status: e.status,
        communityId: community.id,
      }));
    }),
```

- [ ] **Step 5: Add `approveEvent` procedure**

```ts
  approveEvent: protectedProcedure
    .input(z.object({ eventId: z.number(), communitySlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" &&
          membership.role !== "admin" &&
          membership.role !== "moderator")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins and moderators can approve events",
        });
      }

      const payload = await getPayloadClient();
      const existing = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });
      if (!existing || existing.communityId !== community.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "published" },
      });

      const submittedBy = existing.submittedBy as string | undefined;
      if (submittedBy) {
        await ctx.db.insert(notifications).values({
          userId: submittedBy,
          type: "event_approved",
          title: "Your event was approved",
          content: `"${existing.title}" is now published in ${community.name}.`,
          metadata: {
            eventId: String(input.eventId),
            communitySlug: input.communitySlug,
          },
          communityId: community.id,
        });
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.approve",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { communitySlug: input.communitySlug },
      });

      return { success: true };
    }),
```

- [ ] **Step 6: Add `rejectEvent` procedure**

```ts
  rejectEvent: protectedProcedure
    .input(z.object({ eventId: z.number(), communitySlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.communitySlug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
      }

      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, community.id),
          eq(communityMemberships.userId, userId),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (
        !membership ||
        (membership.role !== "owner" &&
          membership.role !== "admin" &&
          membership.role !== "moderator")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only community admins and moderators can reject events",
        });
      }

      const payload = await getPayloadClient();
      const existing = await payload.findByID({
        collection: "events",
        id: input.eventId,
        depth: 0,
      });
      if (!existing || existing.communityId !== community.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Event not found in this community",
        });
      }

      await payload.update({
        collection: "events",
        id: input.eventId,
        data: { status: "rejected" },
      });

      const submittedBy = existing.submittedBy as string | undefined;
      if (submittedBy) {
        await ctx.db.insert(notifications).values({
          userId: submittedBy,
          type: "event_rejected",
          title: "Your event needs revision",
          content: `"${existing.title}" was not approved in ${community.name}. You can edit and resubmit.`,
          metadata: {
            eventId: String(input.eventId),
            communitySlug: input.communitySlug,
          },
          communityId: community.id,
        });
      }

      await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "event.reject",
        targetType: "event",
        targetId: String(input.eventId),
        metadata: { communitySlug: input.communitySlug },
      });

      return { success: true };
    }),
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/server/api/routers/events.ts
git commit -m "feat(events): add submitEvent, approveEvent, rejectEvent, getPendingCommunityEvents, getMyEventSubmissions tRPC procedures"
```

---

## Task 4: Update EventFormDialog — hide internal fields for members

**Files:**
- Modify: `src/components/communities/event-form-dialog.tsx`

- [ ] **Step 1: Add `isAdminOrOwner` prop to the interface**

Find the `EventFormDialogProps` interface (around line 95):

```ts
interface EventFormDialogProps {
  slug: string;
  mode: "create" | "edit";
  eventId?: number;
  initialData?: Partial<EventFormData>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Change to:

```ts
interface EventFormDialogProps {
  slug: string;
  mode: "create" | "edit";
  eventId?: number;
  initialData?: Partial<EventFormData>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdminOrOwner?: boolean;
}
```

- [ ] **Step 2: Destructure the new prop**

In the `EventFormDialog` function signature (around line 104), change:

```ts
export function EventFormDialog({
  slug,
  mode,
  eventId,
  initialData,
  open,
  onOpenChange,
}: EventFormDialogProps) {
```

to:

```ts
export function EventFormDialog({
  slug,
  mode,
  eventId,
  initialData,
  open,
  onOpenChange,
  isAdminOrOwner = false,
}: EventFormDialogProps) {
```

- [ ] **Step 3: Wire up the `submitEvent` mutation**

After the existing `updateMutation` declaration (around line 137), add:

```ts
  const submitMutation = api.events.submitEvent.useMutation({
    onSuccess: () => {
      toast.success("Event submitted for approval");
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
      void utils.events.getMyEventSubmissions.invalidate();
    },
    onError: () => toast.error("Failed to submit event"),
  });
```

- [ ] **Step 4: Update `isPending` and `handleSubmit`**

Find `const isPending = ...` (around line 204) and `handleSubmit` (around line 183). Replace both:

```ts
  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "edit" && eventId) {
      updateMutation.mutate({ eventId, ...payload });
    } else if (isAdminOrOwner) {
      createMutation.mutate(payload);
    } else {
      submitMutation.mutate(payload);
    }
  };
```

- [ ] **Step 5: Hide internal fields from members**

Find the second `<div className="grid gap-4 border-t pt-4 sm:grid-cols-2">` section (around line 372). Wrap the internal-only fields in `{isAdminOrOwner && (...)}`:

Fields to hide from members: AIT fit score, Confidence score, Discovery source, Last verified at, Curated by agent checkbox.

Replace the section from the border-t div through the submit button with:

```tsx
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="event-focus">Focus</Label>
              <Select
                value={form.focus || "__none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    focus: v === "__none" ? "" : (v as EventFocus),
                  })
                }
              >
                <SelectTrigger id="event-focus">
                  <SelectValue placeholder="Select focus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {EVENT_FOCUS_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {EVENT_FOCUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-level">Level</Label>
              <Select
                value={form.level || "__none"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    level: v === "__none" ? "" : (v as EventLevel),
                  })
                }
              >
                <SelectTrigger id="event-level">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {EVENT_LEVEL_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {EVENT_LEVEL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isAdminOrOwner && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="event-score">AIT fit score</Label>
                  <Input
                    id="event-score"
                    type="number"
                    min={1}
                    max={10}
                    value={form.aitFitScore}
                    onChange={(e) =>
                      setForm({ ...form, aitFitScore: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-confidence">Confidence score</Label>
                  <Input
                    id="event-confidence"
                    type="number"
                    min={0}
                    max={1}
                    step="0.1"
                    value={form.confidenceScore}
                    onChange={(e) =>
                      setForm({ ...form, confidenceScore: e.target.value })
                    }
                  />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Audience</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_AUDIENCE_OPTIONS.map((value) => {
                  const active = form.audience.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleAudience(value)}
                      className={`rounded border px-3 py-1 text-sm ${active ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                    >
                      {EVENT_AUDIENCE_LABELS[value]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="event-tags">Tags</Label>
              <Input
                id="event-tags"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="ai, llm, agents"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-source">Source URL</Label>
              <Input
                id="event-source"
                type="url"
                value={form.sourceUrl}
                onChange={(e) =>
                  setForm({ ...form, sourceUrl: e.target.value })
                }
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-video">Video URL</Label>
              <Input
                id="event-video"
                type="url"
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="https://youtube.com/..."
              />
            </div>
            {isAdminOrOwner && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="event-discovery-source">Discovery source</Label>
                  <Input
                    id="event-discovery-source"
                    value={form.discoverySource}
                    onChange={(e) =>
                      setForm({ ...form, discoverySource: e.target.value })
                    }
                    placeholder="luma, meetup, linkedin"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-last-verified">Last verified at</Label>
                  <Input
                    id="event-last-verified"
                    type="datetime-local"
                    value={form.lastVerifiedAt}
                    onChange={(e) =>
                      setForm({ ...form, lastVerifiedAt: e.target.value })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.curatedByAgent}
                    onChange={(e) =>
                      setForm({ ...form, curatedByAgent: e.target.checked })
                    }
                  />
                  <span className="text-sm">Curated by agent</span>
                </label>
              </>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {mode === "edit" ? "Saving..." : isAdminOrOwner ? t("creating") : "Submitting..."}
              </>
            ) : mode === "edit" ? (
              t("editEvent")
            ) : isAdminOrOwner ? (
              t("createEvent")
            ) : (
              "Submit for Approval"
            )}
          </Button>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/communities/event-form-dialog.tsx
git commit -m "feat(events): add isAdminOrOwner prop to EventFormDialog to hide internal fields for members"
```

---

## Task 5: Update community events page

**Files:**
- Modify: `src/app/[locale]/communities/[slug]/events/page.tsx`

- [ ] **Step 1: Replace the entire file with the updated version**

```tsx
"use client";

import { use, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  XCircle,
  ExternalLink,
  CheckCircle,
  Clock,
  XOctagon,
} from "lucide-react";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { EventFormDialog } from "@/components/communities/event-form-dialog";

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

type Tab = "published" | "pending" | "mine";

export default function CommunityEventsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const t = useTranslations("events");
  const { data: session } = authClient.useSession();

  const [activeTab, setActiveTab] = useState<Tab>("published");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<{
    id: number;
    data: Record<string, string>;
  } | null>(null);

  const { data: myCommunities } = api.communities.getMyCommunities.useQuery(
    undefined,
    { enabled: !!session?.user },
  );
  const myMembership = myCommunities?.find((c) => c.slug === slug);
  const isAdminOrOwner =
    myMembership?.status === "active" &&
    (myMembership.role === "owner" || myMembership.role === "admin");
  const isModerator =
    myMembership?.status === "active" && myMembership.role === "moderator";
  const canModerate = isAdminOrOwner || isModerator;
  const isActiveMember = myMembership?.status === "active";

  const { data: eventsData, isLoading } =
    api.events.getCommunityEvents.useQuery({ communitySlug: slug });
  const events = eventsData ?? [];

  const { data: pendingEvents, isLoading: pendingLoading } =
    api.events.getPendingCommunityEvents.useQuery(
      { communitySlug: slug },
      { enabled: canModerate },
    );

  const { data: mySubmissions, isLoading: mySubmissionsLoading } =
    api.events.getMyEventSubmissions.useQuery(
      { communitySlug: slug },
      { enabled: isActiveMember && !!session?.user },
    );

  const utils = api.useUtils();

  const cancelMutation = api.events.cancelEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCancelled"));
      void utils.events.getCommunityEvents.invalidate();
    },
  });

  const approveMutation = api.events.approveEvent.useMutation({
    onSuccess: () => {
      toast.success("Event approved and published");
      void utils.events.getPendingCommunityEvents.invalidate();
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error("Failed to approve event"),
  });

  const rejectMutation = api.events.rejectEvent.useMutation({
    onSuccess: () => {
      toast.success("Event rejected — submitter has been notified");
      void utils.events.getPendingCommunityEvents.invalidate();
    },
    onError: () => toast.error("Failed to reject event"),
  });

  const pendingCount = pendingEvents?.length ?? 0;

  const sharedRowClassName =
    "border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0";

  function renderEventRow(
    event: {
      id: number | string;
      title: string;
      type: string;
      date: string;
      location: string;
      status: string;
      source?: string;
      lumaUrl?: string | null;
      slug?: string;
    },
    opts: {
      showAdminActions?: boolean;
      showApproveReject?: boolean;
      showStatus?: boolean;
    } = {},
  ) {
    const isLuma = event.source === "luma";

    const innerContent = (
      <>
        <span className="flex items-center gap-1.5 text-[15px] leading-snug font-medium sm:order-2 sm:flex-1">
          {event.title}
          {isLuma && (
            <ExternalLink className="text-muted-foreground inline size-3" />
          )}
        </span>
        <div className="flex items-center gap-3 sm:order-1 sm:w-32">
          <div className="bg-foreground h-2 w-2 rounded-full" />
          <span className="font-mono text-[12px] sm:text-[13px]">
            {formatDate(event.date)}
          </span>
          <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden">
            {typeLabels[event.type] ?? event.type}
          </span>
        </div>
        <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline">
          {typeLabels[event.type] ?? event.type}
        </span>
        {opts.showStatus && event.status === "rejected" && (
          <span className="text-destructive font-mono text-[10px] font-medium sm:order-4 sm:ml-2 flex items-center gap-1">
            <XOctagon className="size-3" /> REJECTED — edit and resubmit
          </span>
        )}
        {opts.showStatus && event.status === "draft" && (
          <span className="text-muted-foreground font-mono text-[10px] font-medium sm:order-4 sm:ml-2 flex items-center gap-1">
            <Clock className="size-3" /> PENDING APPROVAL
          </span>
        )}
        {event.status === "cancelled" && (
          <span className="text-destructive font-mono text-[10px] font-medium sm:order-4 sm:ml-2">
            {t("cancelled")}
          </span>
        )}
        <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-5 sm:inline">
          +
        </span>
        {opts.showAdminActions && !isLuma && event.status !== "cancelled" && (
          <div
            className="flex shrink-0 items-center gap-1 sm:order-6"
            onClick={(e) => e.preventDefault()}
          >
            <button
              className="rounded p-1 hover:bg-zinc-100"
              onClick={() => {
                setEditingEvent({
                  id: event.id as number,
                  data: {
                    title: event.title,
                    description: "",
                    type: event.type,
                    date:
                      typeof event.date === "string"
                        ? (event.date.split("T")[0] ?? "")
                        : "",
                    location: event.location,
                    maxAttendees: "",
                  },
                });
                setDialogOpen(true);
              }}
            >
              <Pencil className="size-3.5 text-zinc-400" />
            </button>
            <button
              className="rounded p-1 hover:bg-zinc-100"
              onClick={() => {
                if (window.confirm(t("cancelEventConfirm"))) {
                  cancelMutation.mutate({
                    eventId: event.id as number,
                    communitySlug: slug,
                  });
                }
              }}
            >
              <XCircle className="size-3.5 text-zinc-400" />
            </button>
          </div>
        )}
        {opts.showApproveReject && (
          <div
            className="flex shrink-0 items-center gap-1 sm:order-6"
            onClick={(e) => e.preventDefault()}
          >
            <button
              className="flex items-center gap-1 rounded border border-green-600 px-2 py-0.5 text-[11px] font-mono text-green-600 hover:bg-green-50"
              onClick={() =>
                approveMutation.mutate({
                  eventId: event.id as number,
                  communitySlug: slug,
                })
              }
            >
              <CheckCircle className="size-3" /> Approve
            </button>
            <button
              className="flex items-center gap-1 rounded border border-red-500 px-2 py-0.5 text-[11px] font-mono text-red-500 hover:bg-red-50"
              onClick={() =>
                rejectMutation.mutate({
                  eventId: event.id as number,
                  communitySlug: slug,
                })
              }
            >
              <XOctagon className="size-3" /> Reject
            </button>
          </div>
        )}
      </>
    );

    if (isLuma && event.lumaUrl) {
      return (
        <a
          key={event.id}
          href={event.lumaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedRowClassName}
        >
          {innerContent}
        </a>
      );
    }

    if (event.slug) {
      return (
        <Link
          key={event.id}
          href={`/events/${event.slug}` as never}
          className={sharedRowClassName}
        >
          {innerContent}
        </Link>
      );
    }

    return (
      <div key={event.id} className={sharedRowClassName}>
        {innerContent}
      </div>
    );
  }

  const tableHeader = (
    <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
      <span className="text-muted-foreground w-32 font-mono text-[11px] font-medium tracking-wider">
        / DATE
      </span>
      <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
        / NAME
      </span>
      <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
        / TYPE
      </span>
    </div>
  );

  return (
    <div>
      {/* Header row: tab switcher + action button */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 font-mono text-[11px] tracking-wider">
          <button
            onClick={() => setActiveTab("published")}
            className={`rounded border px-3 py-1.5 transition-colors ${
              activeTab === "published"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-secondary/40"
            }`}
          >
            EVENTS
          </button>
          {canModerate && (
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 transition-colors ${
                activeTab === "pending"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              PENDING
              {pendingCount > 0 && (
                <span className="flex size-4 items-center justify-center rounded-full bg-orange-500 text-[9px] text-white">
                  {pendingCount}
                </span>
              )}
            </button>
          )}
          {isActiveMember && !canModerate && (mySubmissions?.length ?? 0) > 0 && (
            <button
              onClick={() => setActiveTab("mine")}
              className={`rounded border px-3 py-1.5 transition-colors ${
                activeTab === "mine"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-secondary/40"
              }`}
            >
              MY SUBMISSIONS
            </button>
          )}
        </div>

        {isActiveMember && (
          <Button
            size="sm"
            onClick={() => {
              setEditingEvent(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" />
            {isAdminOrOwner ? t("createEvent") : "Submit Event"}
          </Button>
        )}
      </div>

      {/* PUBLISHED tab */}
      {activeTab === "published" && (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="bg-muted h-14 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground mt-8 text-center">
              {t("noEvents")}
            </p>
          ) : (
            <>
              {tableHeader}
              {events.map((event) =>
                renderEventRow(event, { showAdminActions: isAdminOrOwner }),
              )}
            </>
          )}
        </>
      )}

      {/* PENDING tab (admin/mod only) */}
      {activeTab === "pending" && canModerate && (
        <>
          {pendingLoading ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div key={n} className="bg-muted h-14 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (pendingEvents?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground mt-8 text-center">
              No events pending approval.
            </p>
          ) : (
            <>
              {tableHeader}
              {pendingEvents!.map((event) =>
                renderEventRow(event, { showApproveReject: true }),
              )}
            </>
          )}
        </>
      )}

      {/* MY SUBMISSIONS tab (active member, non-moderator) */}
      {activeTab === "mine" && isActiveMember && (
        <>
          {mySubmissionsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((n) => (
                <div key={n} className="bg-muted h-14 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (mySubmissions?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground mt-8 text-center">
              No submissions yet.
            </p>
          ) : (
            <>
              {tableHeader}
              {mySubmissions!.map((event) =>
                renderEventRow(event, { showStatus: true }),
              )}
            </>
          )}
        </>
      )}

      <EventFormDialog
        slug={slug}
        mode={editingEvent ? "edit" : "create"}
        eventId={editingEvent?.id}
        initialData={editingEvent?.data}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isAdminOrOwner={isAdminOrOwner}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/communities/[slug]/events/page.tsx"
git commit -m "feat(events): allow any active member to submit events; add Pending tab with approve/reject for admins"
```

---

## Task 6: Community badge on global events page

**Files:**
- Modify: `src/app/[locale]/events/page.tsx`

- [ ] **Step 1: Add Drizzle import and db import to the page**

At the top of `src/app/[locale]/events/page.tsx`, add:

```ts
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
```

(Check if `db` is already imported via `getPayloadClient`. It may not be — look for `import { db }` in other server pages. If the pattern is `const { db } = await import("@/server/db")` use that instead. In this codebase, looking at other files, the Drizzle db is typically imported as `import { db } from "@/server/db"` but tRPC context uses `ctx.db`. For server components, import directly.)

- [ ] **Step 2: Add community batch-fetch after the Payload query**

After the `payload.find(...)` call (around line 184–198), insert:

```ts
  // Batch-fetch community metadata for events that came from a community
  const communityIds = [
    ...new Set(
      eventsFetched
        .map((e) => e.communityId as string | undefined)
        .filter((id): id is string => !!id),
    ),
  ];

  const communityRows =
    communityIds.length > 0
      ? await db
          .select({
            id: communities.id,
            name: communities.name,
            slug: communities.slug,
            logoUrl: communities.logoUrl,
          })
          .from(communities)
          .where(inArray(communities.id, communityIds))
      : [];

  const communityMap = Object.fromEntries(
    communityRows.map((c) => [c.id, c]),
  ) as Record<string, { name: string; slug: string; logoUrl: string | null }>;
```

- [ ] **Step 3: Pass `communityMap` to event card rendering and render the badge**

In the event card JSX (around line 344–418), inside the `events.map(...)`, find where the metadata chips are rendered (the `<div className="text-muted-foreground flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider">` block). After the existing chips (date, type, format, distance), add a community badge:

```tsx
                    {(() => {
                      const communityId = event.communityId as string | undefined;
                      const community = communityId ? communityMap[communityId] : undefined;
                      if (!community) return null;
                      return (
                        <>
                          <span>•</span>
                          <Link
                            href={`/communities/${community.slug}` as never}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 hover:underline"
                          >
                            {community.logoUrl && (
                              <img
                                src={community.logoUrl}
                                alt={community.name}
                                className="size-3.5 rounded-full object-cover"
                              />
                            )}
                            <span>{community.name}</span>
                          </Link>
                        </>
                      );
                    })()}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/events/page.tsx"
git commit -m "feat(events): show community badge on global events page for community-submitted events"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Any active community member can submit — `submitEvent` procedure, submit button visible to all `isActiveMember`
- [x] Submitted events start as `draft` — `status: "draft"` in `submitEvent`
- [x] Admin notified in-app — `notifications` insert in `submitEvent`
- [x] Pending tab for admins — `getPendingCommunityEvents` + `activeTab === "pending"` with badge count
- [x] Community badge on global events page — `communityMap` batch query + badge render
- [x] Simplified form for members — `isAdminOrOwner` hides AIT fit score, confidence score, discovery source, last verified at, curated by agent
- [x] Rejected events: `rejectEvent` sets `status: "rejected"`, member notified, can resubmit via edit
- [x] Moderator role can approve/reject — `canModerate = isAdminOrOwner || isModerator` gates pending tab and approve/reject mutations
- [x] Community badge links to community page — uses `community.slug`

**Placeholder scan:** No TBD or TODO in plan — all code is concrete.

**Type consistency:** `event.id as number` used consistently with Payload's numeric IDs; `communityId` typed as `string | undefined` throughout; `submittedBy` as `string | null | undefined` matches the Payload text field return type.
