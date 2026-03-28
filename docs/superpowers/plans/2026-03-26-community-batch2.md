# Community Batch 2 — Complete the CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit/delete for forum threads and replies (soft delete), event edit/cancel, transfer ownership page, and hide the Leave button for owners.

**Architecture:** Add soft-delete fields to Payload collections, new tRPC procedures for CRUD operations with author + role-based access, inline edit/delete UI via kebab menus and DropdownMenu, extract event form into shared component for create/edit reuse.

**Tech Stack:** Next.js 15 App Router, tRPC, Payload CMS 3, shadcn/ui (DropdownMenu, Dialog, Tabs, Select), next-intl, Tailwind CSS

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/app/[locale]/communities/[slug]/settings/ownership/page.tsx` | Thin page shell for ownership transfer |
| `src/components/communities/settings/ownership-settings.tsx` | Transfer ownership UI component |
| `src/components/communities/event-form-dialog.tsx` | Shared event form dialog (create + edit modes) |

### Modified files
| File | Change |
|------|--------|
| `messages/en.json` | Add translation keys for edit/delete/events/ownership |
| `messages/nl.json` | Add Dutch translation keys |
| `src/collections/ForumThreads.ts` | Add `isDeleted`, `isEdited`, `editedAt` fields |
| `src/collections/ForumReplies.ts` | Add `isDeleted`, `isEdited`, `editedAt` fields |
| `src/server/api/routers/forum.ts` | Add `editThread`, `deleteThread`, `editReply`, `deleteReply`; filter deleted from `getThreads` |
| `src/server/api/routers/events.ts` | Add `updateEvent`, `cancelEvent` |
| `src/components/forum/thread-detail.tsx` | Add edit/delete UI for author + moderators |
| `src/components/forum/reply-list.tsx` | Add edit/delete kebab menu per reply |
| `src/app/[locale]/communities/[slug]/events/page.tsx` | Extract form, add edit/cancel buttons |
| `src/components/communities/join-button.tsx` | Add `memberRole` prop, hide leave for owners |
| `src/components/communities/community-header.tsx` | Pass `memberRole` to JoinButton |
| `src/app/[locale]/communities/[slug]/layout.tsx` | Pass `memberRole` to CommunityHeader |

---

## Task 1: Add translation keys

**Files:**
- Modify: `messages/en.json`
- Modify: `messages/nl.json`

- [ ] **Step 1: Add English translations**

Add these keys to the `"forum"` object in `messages/en.json`:

```json
"edit": "Edit",
"delete": "Delete",
"deleteThreadConfirm": "Delete this thread? The content will be removed but replies will remain.",
"deleteReplyConfirm": "Delete this reply? The content will be removed.",
"threadDeletedMessage": "[This thread has been deleted]",
"replyDeletedMessage": "[This reply has been deleted]",
"edited": "edited",
"editing": "Editing...",
"save": "Save",
"threadEdited": "Thread updated",
"replyEdited": "Reply updated",
"threadDeleted": "Thread deleted",
"replyDeleted": "Reply deleted"
```

Add these keys to the `"events"` object:

```json
"editEvent": "Edit Event",
"cancelEvent": "Cancel Event",
"cancelEventConfirm": "Cancel this event? All registrations will be cancelled.",
"eventUpdated": "Event updated",
"eventCancelled": "Event cancelled",
"cancelled": "CANCELLED"
```

Add a new `"ownership"` section inside `"communities"."settings"`:

```json
"ownership": {
  "title": "Transfer Ownership",
  "description": "Transfer this community's ownership to another active member.",
  "warning": "This action will demote you to admin. The new owner will have full control of the community.",
  "selectMember": "Select new owner",
  "transfer": "Transfer Ownership",
  "confirmTitle": "Transfer Ownership",
  "confirmDescription": "Transfer ownership to {name}? You will be demoted to admin. This cannot be undone.",
  "confirmButton": "Confirm Transfer",
  "transferred": "Ownership transferred"
}
```

- [ ] **Step 2: Add Dutch translations**

Add the same keys to `messages/nl.json` with Dutch translations:
- Edit = "Bewerken", Delete = "Verwijderen", Save = "Opslaan"
- Transfer Ownership = "Eigenaarschap overdragen"
- Cancel Event = "Evenement annuleren"

- [ ] **Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(communities): add batch 2 translation keys"
```

---

## Task 2: Data model — add soft-delete and edit fields

**Files:**
- Modify: `src/collections/ForumThreads.ts`
- Modify: `src/collections/ForumReplies.ts`

- [ ] **Step 1: Add fields to ForumThreads**

In `src/collections/ForumThreads.ts`, add these three fields after the `communityId` field (before the closing `]` of the fields array):

```typescript
{
  name: "isDeleted",
  type: "checkbox",
  defaultValue: false,
  admin: { position: "sidebar" },
},
{
  name: "isEdited",
  type: "checkbox",
  defaultValue: false,
  admin: { position: "sidebar", readOnly: true },
},
{
  name: "editedAt",
  type: "date",
  admin: { position: "sidebar", readOnly: true },
},
```

- [ ] **Step 2: Add fields to ForumReplies**

In `src/collections/ForumReplies.ts`, add the same three fields after the `communityId` field:

```typescript
{
  name: "isDeleted",
  type: "checkbox",
  defaultValue: false,
  admin: { position: "sidebar" },
},
{
  name: "isEdited",
  type: "checkbox",
  defaultValue: false,
  admin: { position: "sidebar", readOnly: true },
},
{
  name: "editedAt",
  type: "date",
  admin: { position: "sidebar", readOnly: true },
},
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/collections/ForumThreads.ts src/collections/ForumReplies.ts
git commit -m "feat(forum): add soft-delete and edit tracking fields"
```

---

## Task 3: Backend — thread and reply edit/delete procedures

**Files:**
- Modify: `src/server/api/routers/forum.ts`

- [ ] **Step 1: Add `editThread` procedure**

Add after `lockThread` in the forum router (before `upsertRules`):

```typescript
/** Edit a thread (author or admin/mod) */
editThread: protectedProcedure
  .input(
    z.object({
      threadId: z.number(),
      title: z.string().min(3).max(255),
      content: z.string().min(1).max(10000),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const payload = await getPayloadClient();
    const thread = await payload.findByID({
      collection: "forum-threads",
      id: input.threadId,
      depth: 0,
    });

    if (thread.isDeleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Thread has been deleted" });
    }

    // Check: author or community moderator
    const isAuthor = thread.authorId === ctx.session.user.id;
    let canEdit = isAuthor;

    if (!canEdit && thread.communityId) {
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, thread.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (membership && (membership.role === "owner" || membership.role === "admin" || membership.role === "moderator")) {
        canEdit = true;
      }
    }

    if (!canEdit) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await payload.update({
      collection: "forum-threads",
      id: input.threadId,
      data: {
        title: input.title,
        content: plainTextToLexical(input.content),
        isEdited: true,
        editedAt: new Date().toISOString(),
      },
    });

    return { success: true };
  }),
```

- [ ] **Step 2: Add `deleteThread` procedure**

Add after `editThread`:

```typescript
/** Soft-delete a thread (author or admin/mod) */
deleteThread: protectedProcedure
  .input(z.object({ threadId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const payload = await getPayloadClient();
    const thread = await payload.findByID({
      collection: "forum-threads",
      id: input.threadId,
      depth: 0,
    });

    if (thread.isDeleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Thread already deleted" });
    }

    const isAuthor = thread.authorId === ctx.session.user.id;
    let canDelete = isAuthor;

    if (!canDelete && thread.communityId) {
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, thread.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (membership && (membership.role === "owner" || membership.role === "admin" || membership.role === "moderator")) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await payload.update({
      collection: "forum-threads",
      id: input.threadId,
      data: {
        isDeleted: true,
        content: plainTextToLexical(""),
        authorName: null,
      },
    });

    return { success: true };
  }),
```

- [ ] **Step 3: Add `editReply` procedure**

Add after `deleteThread`:

```typescript
/** Edit a reply (author or admin/mod) */
editReply: protectedProcedure
  .input(
    z.object({
      replyId: z.number(),
      content: z.string().min(1).max(10000),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const payload = await getPayloadClient();
    const reply = await payload.findByID({
      collection: "forum-replies",
      id: input.replyId,
      depth: 0,
    });

    if (reply.isDeleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Reply has been deleted" });
    }

    const isAuthor = reply.authorId === ctx.session.user.id;
    let canEdit = isAuthor;

    if (!canEdit && reply.communityId) {
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, reply.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (membership && (membership.role === "owner" || membership.role === "admin" || membership.role === "moderator")) {
        canEdit = true;
      }
    }

    if (!canEdit) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await payload.update({
      collection: "forum-replies",
      id: input.replyId,
      data: {
        content: plainTextToLexical(input.content),
        isEdited: true,
        editedAt: new Date().toISOString(),
      },
    });

    return { success: true };
  }),
```

- [ ] **Step 4: Add `deleteReply` procedure**

Add after `editReply`:

```typescript
/** Soft-delete a reply (author or admin/mod) */
deleteReply: protectedProcedure
  .input(z.object({ replyId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    const payload = await getPayloadClient();
    const reply = await payload.findByID({
      collection: "forum-replies",
      id: input.replyId,
      depth: 0,
    });

    if (reply.isDeleted) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Reply already deleted" });
    }

    const isAuthor = reply.authorId === ctx.session.user.id;
    let canDelete = isAuthor;

    if (!canDelete && reply.communityId) {
      const membership = await ctx.db.query.communityMemberships.findFirst({
        where: and(
          eq(communityMemberships.communityId, reply.communityId),
          eq(communityMemberships.userId, ctx.session.user.id),
          eq(communityMemberships.status, "active"),
        ),
      });
      if (membership && (membership.role === "owner" || membership.role === "admin" || membership.role === "moderator")) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    // Get parent thread to decrement reply count
    const threadId = typeof reply.thread === "object" ? reply.thread.id : reply.thread;

    await payload.update({
      collection: "forum-replies",
      id: input.replyId,
      data: {
        isDeleted: true,
        content: plainTextToLexical(""),
        authorName: null,
      },
    });

    // Decrement thread reply count
    const thread = await payload.findByID({
      collection: "forum-threads",
      id: threadId,
      depth: 0,
    });
    await payload.update({
      collection: "forum-threads",
      id: threadId,
      data: { replyCount: Math.max(0, (thread.replyCount ?? 0) - 1) },
    });

    return { success: true };
  }),
```

- [ ] **Step 5: Filter deleted threads from `getThreads`**

In the `getThreads` procedure, find where `conditions` array is built (around line 300). Add a filter at the start of the conditions array, before any other conditions:

```typescript
conditions.push({ isDeleted: { not_equals: true } });
```

- [ ] **Step 6: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/server/api/routers/forum.ts
git commit -m "feat(forum): add edit/delete thread and reply procedures with soft-delete"
```

---

## Task 4: Backend — event update and cancel procedures

**Files:**
- Modify: `src/server/api/routers/events.ts`

- [ ] **Step 1: Add `updateEvent` procedure**

Add after `createEvent` in the events router:

```typescript
/** Update an event (admin/owner only) */
updateEvent: protectedProcedure
  .input(
    z.object({
      eventId: z.number(),
      communitySlug: z.string(),
      title: z.string().min(3).max(255).optional(),
      description: z.string().max(5000).optional(),
      type: z.enum(["workshop", "hackathon", "deep_dive", "meetup"]).optional(),
      date: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      location: z.string().min(1).max(255).optional(),
      maxAttendees: z.number().min(1).optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const community = await ctx.db.query.communities.findFirst({
      where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
    });
    if (!community) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
    }

    const membership = await ctx.db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.userId, userId),
      ),
    });
    if (membership?.status !== "active" || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only community admins can update events" });
    }

    const payload = await getPayloadClient();

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = plainTextToLexical(input.description);
    if (input.type !== undefined) data.type = input.type;
    if (input.date !== undefined) data.date = input.date;
    if (input.startTime !== undefined) data.startTime = input.startTime;
    if (input.endTime !== undefined) data.endTime = input.endTime;
    if (input.location !== undefined) data.location = input.location;
    if (input.maxAttendees !== undefined) data.maxAttendees = input.maxAttendees;

    const event = await payload.update({
      collection: "events",
      id: input.eventId,
      data,
    });

    await logActivity(ctx.db, {
      actorId: userId,
      actorType: "member",
      action: "event.update",
      targetType: "event",
      targetId: String(input.eventId),
      metadata: { title: event.title, communitySlug: input.communitySlug },
    });

    return event;
  }),
```

- [ ] **Step 2: Add `cancelEvent` procedure**

Add after `updateEvent`:

```typescript
/** Cancel an event and all registrations (admin/owner only) */
cancelEvent: protectedProcedure
  .input(
    z.object({
      eventId: z.number(),
      communitySlug: z.string(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const community = await ctx.db.query.communities.findFirst({
      where: and(eq(communities.slug, input.communitySlug), isNull(communities.deletedAt)),
    });
    if (!community) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });
    }

    const membership = await ctx.db.query.communityMemberships.findFirst({
      where: and(
        eq(communityMemberships.communityId, community.id),
        eq(communityMemberships.userId, userId),
      ),
    });
    if (membership?.status !== "active" || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only community admins can cancel events" });
    }

    // Set event status to cancelled
    const payload = await getPayloadClient();
    await payload.update({
      collection: "events",
      id: input.eventId,
      data: { status: "cancelled" },
    });

    // Bulk-cancel all active registrations
    await ctx.db
      .update(eventRegistrations)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(eventRegistrations.eventId, input.eventId),
          sql`${eventRegistrations.status} IN ('registered', 'waitlisted')`,
        ),
      );

    await logActivity(ctx.db, {
      actorId: userId,
      actorType: "member",
      action: "event.cancel",
      targetType: "event",
      targetId: String(input.eventId),
      metadata: { communitySlug: input.communitySlug },
    });

    return { success: true };
  }),
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/server/api/routers/events.ts
git commit -m "feat(events): add updateEvent and cancelEvent procedures"
```

---

## Task 5: UI — thread edit/delete in thread detail

**Files:**
- Modify: `src/components/forum/thread-detail.tsx`

- [ ] **Step 1: Add edit/delete UI to thread detail**

In `src/components/forum/thread-detail.tsx`:

1. Add imports for `MoreHorizontal`, `Pencil`, `Trash2` from lucide-react, and DropdownMenu components.
2. Add `useState` for edit mode: `const [isEditing, setIsEditing] = useState(false)`, `const [editTitle, setEditTitle] = useState("")`, `const [editContent, setEditContent] = useState("")`.
3. Add mutations:

```typescript
const editMutation = api.forum.editThread.useMutation({
  onSuccess: () => {
    toast.success(t("threadEdited"));
    setIsEditing(false);
    void utils.forum.getThread.invalidate({ slug });
  },
});

const deleteMutation = api.forum.deleteThread.useMutation({
  onSuccess: () => {
    toast.success(t("threadDeleted"));
    void utils.forum.getThread.invalidate({ slug });
  },
});
```

4. Add authorship check: `const isAuthor = session?.user?.id === thread?.authorId`
5. Replace the existing admin actions section. The current `{canModerate && (...)}` block has pin/lock buttons. Convert this to a DropdownMenu that includes:
   - Pin/Unpin (if canModerate)
   - Lock/Unlock (if canModerate)
   - Edit (if isAuthor — authors edit their own content)
   - Delete (if isAuthor OR canModerate)

6. When `thread.isDeleted`, render the deleted message instead of content:

```tsx
{thread.isDeleted ? (
  <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-5 text-center text-sm text-zinc-400 italic">
    {t("threadDeletedMessage")}
  </div>
) : isEditing ? (
  <div className="mt-6 space-y-3">
    <input
      value={editTitle}
      onChange={(e) => setEditTitle(e.target.value)}
      className="w-full rounded-md border px-3 py-2 text-sm font-medium"
    />
    <textarea
      value={editContent}
      onChange={(e) => setEditContent(e.target.value)}
      rows={6}
      className="w-full rounded-md border px-3 py-2 text-sm"
    />
    <div className="flex gap-2">
      <button
        onClick={() => editMutation.mutate({ threadId: thread.id, title: editTitle, content: editContent })}
        disabled={editMutation.isPending}
        className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-xs font-semibold"
      >
        {t("save")}
      </button>
      <button onClick={() => setIsEditing(false)} className="rounded-md border px-4 py-1.5 text-xs">
        {t("cancel")}
      </button>
    </div>
  </div>
) : (
  <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 text-sm leading-relaxed text-zinc-700">
    <LexicalRenderer content={thread.content} />
  </div>
)}
```

7. Show "(edited)" next to the timestamp when `thread.isEdited`:

```tsx
{thread.isEdited && (
  <span className="text-zinc-400 italic">({t("edited")})</span>
)}
```

8. When entering edit mode, pre-fill: `setEditTitle(thread.title)` and `setEditContent("")` (content is lexical JSON — for now just let the user re-enter text).

- [ ] **Step 2: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/forum/thread-detail.tsx
git commit -m "feat(forum): add inline thread edit/delete UI"
```

---

## Task 6: UI — reply edit/delete in reply list

**Files:**
- Modify: `src/components/forum/reply-list.tsx`
- Modify: `src/components/forum/thread-detail.tsx` (pass new props)

- [ ] **Step 1: Update ReplyList to support edit/delete**

Rewrite `src/components/forum/reply-list.tsx`:

1. Add new props:

```typescript
type ReplyListProps = {
  replies: ForumReply[];
  currentUserId?: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  threadSlug: string;
};
```

2. Add imports for `useState`, `MoreHorizontal`, `Pencil`, `Trash2`, `DropdownMenu*`, `api`, `toast`, and `useTranslations`.

3. For each reply, add:
   - Deleted state: if `reply.isDeleted`, render `"[This reply has been deleted]"` in italic
   - Kebab menu (if not deleted): show Edit (author only) and Delete (author or canModerate)
   - Edit mode: replace content with textarea + Save/Cancel
   - Edited indicator: show "(edited)" next to timestamp if `reply.isEdited`

4. Add mutations inside the component:

```typescript
const utils = api.useUtils();
const canModerate = memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";

const editMutation = api.forum.editReply.useMutation({
  onSuccess: () => {
    toast.success(t("replyEdited"));
    setEditingId(null);
    void utils.forum.getReplies.invalidate();
  },
});

const deleteMutation = api.forum.deleteReply.useMutation({
  onSuccess: () => {
    toast.success(t("replyDeleted"));
    void utils.forum.getReplies.invalidate();
    void utils.forum.getThread.invalidate({ slug: threadSlug });
  },
});
```

Use `const [editingId, setEditingId] = useState<number | null>(null)` and `const [editContent, setEditContent] = useState("")` for tracking which reply is being edited.

- [ ] **Step 2: Update ThreadDetail to pass new props**

In `src/components/forum/thread-detail.tsx`, update the `<ReplyList>` usage:

```tsx
<ReplyList
  replies={replies}
  currentUserId={session?.user?.id}
  memberRole={memberRole}
  threadSlug={slug}
/>
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/forum/reply-list.tsx src/components/forum/thread-detail.tsx
git commit -m "feat(forum): add inline reply edit/delete UI"
```

---

## Task 7: UI — event edit and cancel

**Files:**
- Create: `src/components/communities/event-form-dialog.tsx`
- Modify: `src/app/[locale]/communities/[slug]/events/page.tsx`

- [ ] **Step 1: Create shared EventFormDialog**

Create `src/components/communities/event-form-dialog.tsx`:

Extract the form fields from the existing `CreateEventDialog` in `events/page.tsx` into a reusable component:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface EventFormData {
  title: string;
  description: string;
  type: "workshop" | "hackathon" | "deep_dive" | "meetup";
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  maxAttendees: string;
}

const emptyForm: EventFormData = {
  title: "",
  description: "",
  type: "meetup",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  maxAttendees: "",
};

interface EventFormDialogProps {
  slug: string;
  mode: "create" | "edit";
  eventId?: number;
  initialData?: Partial<EventFormData>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventFormDialog({ slug, mode, eventId, initialData, open, onOpenChange }: EventFormDialogProps) {
  const t = useTranslations("events");
  const utils = api.useUtils();
  const [form, setForm] = useState<EventFormData>(emptyForm);

  useEffect(() => {
    if (open && initialData) {
      setForm({ ...emptyForm, ...initialData });
    } else if (open && mode === "create") {
      setForm(emptyForm);
    }
  }, [open, initialData, mode]);

  const createMutation = api.events.createEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventCreated"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error(t("eventCreateError")),
  });

  const updateMutation = api.events.updateEvent.useMutation({
    onSuccess: () => {
      toast.success(t("eventUpdated"));
      onOpenChange(false);
      void utils.events.getCommunityEvents.invalidate();
    },
    onError: () => toast.error("Failed to update event"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "create") {
      createMutation.mutate({
        communitySlug: slug,
        title: form.title,
        description: form.description || undefined,
        type: form.type,
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        location: form.location,
        maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
      });
    } else if (eventId) {
      updateMutation.mutate({
        eventId,
        communitySlug: slug,
        title: form.title,
        description: form.description || undefined,
        type: form.type,
        date: form.date,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        location: form.location,
        maxAttendees: form.maxAttendees ? parseInt(form.maxAttendees, 10) : undefined,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? t("createEvent") : t("editEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Same form fields as existing CreateEventDialog */}
          <div className="space-y-2">
            <Label htmlFor="event-title">{t("eventTitle")}</Label>
            <Input id="event-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-description">{t("eventDescription")}</Label>
            <Textarea id="event-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={5000} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-type">{t("eventType")}</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
                <SelectTrigger id="event-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="meetup">Meetup</SelectItem>
                  <SelectItem value="workshop">Workshop</SelectItem>
                  <SelectItem value="hackathon">Hackathon</SelectItem>
                  <SelectItem value="deep_dive">Deep Dive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-date">{t("eventDate")}</Label>
              <Input id="event-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="event-start">{t("eventStartTime")}</Label>
              <Input id="event-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">{t("eventEndTime")}</Label>
              <Input id="event-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-location">{t("eventLocation")}</Label>
            <Input id="event-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required maxLength={255} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-max">{t("eventMaxAttendees")}</Label>
            <Input id="event-max" type="number" min={1} value={form.maxAttendees} onChange={(e) => setForm({ ...form, maxAttendees: e.target.value })} />
          </div>
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (<><Loader2 className="mr-2 size-4 animate-spin" />{t("creating")}</>) : (mode === "create" ? t("createEvent") : t("editEvent"))}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update events page to use shared form and add edit/cancel**

Rewrite `src/app/[locale]/communities/[slug]/events/page.tsx`:

1. Remove the inline `CreateEventDialog` function entirely.
2. Import `EventFormDialog` from `@/components/communities/event-form-dialog`.
3. Import `Pencil`, `XCircle` from lucide-react and `DropdownMenu` components.
4. Add state for the form dialog: `const [dialogOpen, setDialogOpen] = useState(false)`, `const [editingEvent, setEditingEvent] = useState<{id: number, data: ...} | null>(null)`.
5. Add cancel mutation:

```typescript
const cancelMutation = api.events.cancelEvent.useMutation({
  onSuccess: () => {
    toast.success(t("eventCancelled"));
    void utils.events.getCommunityEvents.invalidate();
  },
});
```

6. Replace the `<CreateEventDialog>` with a button that opens the dialog:

```tsx
<Button size="sm" onClick={() => { setEditingEvent(null); setDialogOpen(true); }}>
  <Plus className="mr-1.5 size-4" /> {t("createEvent")}
</Button>
```

7. On each event row, add edit/cancel buttons (only for admins/owners, and not if already cancelled):

```tsx
{isAdminOrOwner && event.status !== "cancelled" && (
  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.preventDefault()}>
    <button
      className="rounded p-1 hover:bg-zinc-100"
      onClick={() => {
        setEditingEvent({
          id: event.id,
          data: {
            title: event.title,
            description: "",
            type: event.type,
            date: event.date?.split("T")[0] ?? "",
            startTime: event.startTime ?? "",
            endTime: event.endTime ?? "",
            location: event.location,
            maxAttendees: event.maxAttendees ? String(event.maxAttendees) : "",
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
          cancelMutation.mutate({ eventId: event.id, communitySlug: slug });
        }
      }}
    >
      <XCircle className="size-3.5 text-zinc-400" />
    </button>
  </div>
)}
```

8. Show "CANCELLED" badge for cancelled events:

```tsx
{event.status === "cancelled" && (
  <span className="text-destructive font-mono text-[10px] font-medium">{t("cancelled")}</span>
)}
```

9. Render the dialog:

```tsx
<EventFormDialog
  slug={slug}
  mode={editingEvent ? "edit" : "create"}
  eventId={editingEvent?.id}
  initialData={editingEvent?.data}
  open={dialogOpen}
  onOpenChange={setDialogOpen}
/>
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/communities/event-form-dialog.tsx src/app/[locale]/communities/[slug]/events/page.tsx
git commit -m "feat(events): add event edit/cancel UI with shared form dialog"
```

---

## Task 8: Transfer ownership page

**Files:**
- Create: `src/app/[locale]/communities/[slug]/settings/ownership/page.tsx`
- Create: `src/components/communities/settings/ownership-settings.tsx`

- [ ] **Step 1: Create ownership settings component**

Create `src/components/communities/settings/ownership-settings.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";

interface OwnershipSettingsProps {
  slug: string;
}

export function OwnershipSettings({ slug }: OwnershipSettingsProps) {
  const t = useTranslations("communities.settings.ownership");
  const utils = api.useUtils();
  const router = useRouter();
  const { data: session } = authClient.useSession();

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: membersData, isLoading } = api.communities.getMembers.useQuery({
    slug,
    limit: 50,
    status: "active",
  });

  const transferMutation = api.communities.transferOwnership.useMutation({
    onSuccess: () => {
      toast.success(t("transferred"));
      void utils.communities.getMyCommunities.invalidate();
      void utils.communities.getMembers.invalidate();
      router.push(`/communities/${slug}` as never);
    },
  });

  const members = (membersData?.items ?? []).filter(
    (m) => m.userId !== session?.user?.id,
  );

  const selectedMember = members.find((m) => m.userId === selectedUserId);

  const handleTransfer = () => {
    if (!selectedUserId) return;
    transferMutation.mutate({ slug, userId: selectedUserId });
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">{t("warning")}</p>
      </div>

      <div className="space-y-4">
        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder={t("selectMember")} />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.userId} value={member.userId}>
                {member.displayName ?? "Member"} ({member.role})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="destructive"
          disabled={!selectedUserId || transferMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {t("transfer")}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("confirmDescription", { name: selectedMember?.displayName ?? "this member" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTransfer}
              disabled={transferMutation.isPending}
            >
              {transferMutation.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              {t("confirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Create ownership page**

Create `src/app/[locale]/communities/[slug]/settings/ownership/page.tsx`:

```tsx
"use client";

import { use } from "react";
import { OwnershipSettings } from "@/components/communities/settings/ownership-settings";

export default function OwnershipSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return <OwnershipSettings slug={slug} />;
}
```

- [ ] **Step 3: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/[locale]/communities/[slug]/settings/ownership/ src/components/communities/settings/ownership-settings.tsx
git commit -m "feat(communities): transfer ownership settings page"
```

---

## Task 9: Hide Leave button for owners

**Files:**
- Modify: `src/components/communities/join-button.tsx`
- Modify: `src/components/communities/community-header.tsx`
- Modify: `src/app/[locale]/communities/[slug]/layout.tsx`

- [ ] **Step 1: Add `memberRole` prop to JoinButton**

In `src/components/communities/join-button.tsx`, update the interface:

```typescript
interface JoinButtonProps {
  slug: string;
  joinPolicy: JoinPolicy;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function JoinButton({ slug, joinPolicy, membershipStatus, memberRole }: JoinButtonProps) {
```

Add this check before the "Active member: show leave button" section (before line 94):

```typescript
// Owners cannot leave their community
if (membershipStatus === "active" && memberRole === "owner") {
  return null;
}
```

- [ ] **Step 2: Pass `memberRole` from CommunityHeader**

In `src/components/communities/community-header.tsx`, update the interface and pass the prop:

```typescript
interface CommunityHeaderProps {
  community: Community;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}

export function CommunityHeader({ community, membershipStatus, memberRole }: CommunityHeaderProps) {
```

Update the `<JoinButton>` usage:

```tsx
<JoinButton
  slug={community.slug}
  joinPolicy={community.joinPolicy}
  membershipStatus={membershipStatus}
  memberRole={memberRole}
/>
```

- [ ] **Step 3: Pass `memberRole` from community layout**

In `src/app/[locale]/communities/[slug]/layout.tsx`, the `memberRole` is already derived (line 47). Pass it to `CommunityHeader`:

```tsx
<CommunityHeader community={community} membershipStatus={membershipStatus} memberRole={memberRole} />
```

- [ ] **Step 4: Verify with tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/components/communities/join-button.tsx src/components/communities/community-header.tsx src/app/[locale]/communities/[slug]/layout.tsx
git commit -m "feat(communities): hide leave button for community owners"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run tsc**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Manual smoke test checklist**

- Open a forum thread as the author → verify kebab menu shows Edit and Delete
- Edit a thread → verify title/content updates, "(edited)" label appears
- Delete a thread → verify soft-delete message shown, replies still visible, thread removed from list
- Open a reply as the author → verify kebab menu shows Edit and Delete
- Edit a reply → verify content updates, "(edited)" label appears
- Delete a reply → verify soft-delete message, reply count decremented
- Open events as admin → verify pencil and X buttons appear on events
- Edit an event → verify dialog opens pre-filled, save updates the event
- Cancel an event → verify event shows "CANCELLED" badge
- Open ownership settings as owner → verify member select, transfer with double confirm
- Visit community as owner → verify no "Leave" button shown
- Visit community as regular member → verify "Leave" button still shows

- [ ] **Step 3: Commit any fixes**

If any fixes were needed, commit them separately.
