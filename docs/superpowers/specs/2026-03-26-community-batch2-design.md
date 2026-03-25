# Community Features — Batch 2: Complete the CRUD

**Date:** 2026-03-26
**Status:** Draft

## Overview

Batch 1 wired up existing admin APIs. Batch 2 completes the CRUD story: authors can edit/delete their own forum content, admins can edit/cancel events, owners can transfer ownership, and the "Leave" button is hidden for owners.

## Scope

### In scope
1. Thread edit & delete (soft) for authors + admins/mods
2. Reply edit & delete (soft) for authors + admins/mods
3. Event edit & cancellation for admins/owners
4. Transfer ownership page for owners
5. Hide "Leave" button for community owners

### Out of scope
- Notifications, reporting, analytics (Batch 3)
- Direct member invite by email (covered by invite links)
- Community-scoped launchpad (intentionally global)

---

## 1. Thread Edit & Delete (Soft Delete)

### Data model changes (`src/collections/ForumThreads.ts`)

Add three fields:
- `isDeleted` — checkbox, default false
- `isEdited` — checkbox, default false
- `editedAt` — date, nullable

### Backend changes (`src/server/api/routers/forum.ts`)

**`editThread` — new procedure:**
```
Input: { threadId: number, title: string, content: string }
Auth: protectedProcedure
Guards:
  - Thread must exist and not be deleted
  - User must be the thread author OR have admin/owner/moderator role in the thread's community
Action:
  - Update title, content (convert plain text to lexical)
  - Set isEdited: true, editedAt: now
```

**`deleteThread` — new procedure:**
```
Input: { threadId: number }
Auth: protectedProcedure
Guards:
  - Thread must exist and not already be deleted
  - User must be the thread author OR have admin/owner/moderator role in the thread's community
Action:
  - Set isDeleted: true
  - Clear content (set to null or empty lexical)
  - Clear authorName (set to null)
  - Do NOT delete replies — they remain visible
```

**Update `getThreads` query:**
- Filter out threads where `isDeleted` is true (they shouldn't appear in the list)

**Update `getThread` query:**
- Still return deleted threads (so the URL works) but mark them as deleted in the response

### UI changes

**Thread detail (`src/components/forum/thread-detail.tsx`):**
- Add kebab menu (DropdownMenu) next to the admin actions area
- Show "Edit" and "Delete" for the thread author
- Show "Delete" for admins/mods (they can moderate but shouldn't edit others' words)
- "Edit" enters inline edit mode: title becomes an input, content becomes a textarea, with Save/Cancel buttons
- "Delete" shows confirmation dialog
- Deleted threads display: "[This thread has been deleted]" with no content, no author name, replies still shown below
- Edited threads show "(edited)" label next to the timestamp

**Thread card (`src/components/forum/thread-card.tsx`):**
- No changes needed — deleted threads are filtered from the list by the backend

---

## 2. Reply Edit & Delete (Soft Delete)

### Data model changes (`src/collections/ForumReplies.ts`)

Add three fields:
- `isDeleted` — checkbox, default false
- `isEdited` — checkbox, default false
- `editedAt` — date, nullable

### Backend changes (`src/server/api/routers/forum.ts`)

**`editReply` — new procedure:**
```
Input: { replyId: number, content: string }
Auth: protectedProcedure
Guards:
  - Reply must exist and not be deleted
  - User must be the reply author OR have admin/owner/moderator role in the reply's community
Action:
  - Update content (convert plain text to lexical)
  - Set isEdited: true, editedAt: now
```

**`deleteReply` — new procedure:**
```
Input: { replyId: number }
Auth: protectedProcedure
Guards:
  - Reply must exist and not already be deleted
  - User must be the reply author OR have admin/owner/moderator role in the reply's community
Action:
  - Set isDeleted: true
  - Clear content (set to null or empty lexical)
  - Clear authorName (set to null)
  - Decrement the parent thread's replyCount by 1
```

### UI changes

**Reply list (`src/components/forum/reply-list.tsx`):**
- Add kebab menu to each reply (DropdownMenu)
- Show "Edit" and "Delete" for the reply author
- Show "Delete" for admins/mods
- "Edit" replaces the reply content with a textarea + Save/Cancel
- "Delete" shows confirmation
- Deleted replies display: "[This reply has been deleted]" — no content, no author, but the reply slot remains

The reply list currently receives `replies: ForumReply[]` as a prop. It will additionally need:
- `currentUserId?: string` — to check authorship
- `memberRole?: "owner" | "admin" | "moderator" | "member" | null` — for moderation access
- `threadId: number` — for cache invalidation

---

## 3. Event Edit & Cancellation

### Backend changes (`src/server/api/routers/events.ts`)

**`updateEvent` — new procedure:**
```
Input: {
  eventId: number,
  communitySlug: string,
  title?: string,
  description?: string,
  type?: "workshop" | "hackathon" | "deep_dive" | "meetup",
  date?: string,
  startTime?: string,
  endTime?: string,
  location?: string,
  maxAttendees?: number,
}
Auth: protectedProcedure
Guards: admin/owner role in the community (same pattern as createEvent)
Action: Update the event fields in Payload CMS. Only update fields that are provided.
```

**`cancelEvent` — new procedure:**
```
Input: { eventId: number, communitySlug: string }
Auth: protectedProcedure
Guards: admin/owner role in the community
Action:
  1. Set event status to "cancelled" in Payload
  2. Bulk-update all registrations for this event with status "registered" or "waitlisted" to "cancelled"
  3. Log activity
```

### UI changes

**Events page (`src/app/[locale]/communities/[slug]/events/page.tsx`):**
- Add an "Edit" button (pencil icon) and "Cancel" button (X icon) on each event row, visible only to admins/owners
- "Edit" opens a dialog pre-filled with current values — reuse the same form fields as CreateEventDialog. Extract the form into a shared `EventFormDialog` component that handles both create and edit modes.
- "Cancel" shows confirmation: "Cancel this event? All registrations will be cancelled." On confirm, calls `cancelEvent`.
- Cancelled events show with a "CANCELLED" badge and strikethrough styling

### Shared form component

Extract from the existing `CreateEventDialog` into `src/components/communities/event-form-dialog.tsx`:
- Props: `slug`, `mode: "create" | "edit"`, `initialData?` (for edit mode), `onSuccess`
- Same form fields for both modes
- In edit mode: pre-fills form, calls `updateEvent` instead of `createEvent`

---

## 4. Transfer Ownership

### Page

**Route:** `/communities/[slug]/settings/ownership`
**Page file:** `src/app/[locale]/communities/[slug]/settings/ownership/page.tsx`
**Component:** `src/components/communities/settings/ownership-settings.tsx`

### UI

- Only accessible to owners (the sidebar already conditionally shows this item)
- Heading: "Transfer Ownership"
- Warning banner: explains that transferring ownership will demote you to admin
- Select dropdown of current active members (fetched from `getMembers` with status "active"), excluding the current owner
- "Transfer Ownership" button — disabled until a member is selected
- Double confirmation:
  1. First click opens a confirmation dialog: "Transfer ownership to {name}? You will be demoted to admin."
  2. Dialog has a "Confirm Transfer" button
- On success: toast, invalidate queries, redirect to community overview (since user is no longer owner, they lose access to the ownership page)

### Backend

Already implemented — `communities.transferOwnership` exists and handles the atomic role swap.

---

## 5. Hide Leave Button for Owners

### Change

In `src/components/communities/join-button.tsx`, the "active member" section (line 94-101) shows a Leave button for all active members. Add a check: if the user's role is `owner`, don't show the Leave button.

### Props change

`JoinButton` currently receives `membershipStatus` but not the member's role. Add an optional `memberRole` prop:

```typescript
interface JoinButtonProps {
  slug: string;
  joinPolicy: JoinPolicy;
  membershipStatus: MembershipStatus;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
}
```

In the active member section, add:
```typescript
if (membershipStatus === "active" && memberRole === "owner") {
  return null; // Owners cannot leave
}
```

The parent component (`community-header.tsx`) already has access to membership data and can pass the role.

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/app/[locale]/communities/[slug]/settings/ownership/page.tsx` | Transfer ownership page |
| `src/components/communities/settings/ownership-settings.tsx` | Transfer ownership component |
| `src/components/communities/event-form-dialog.tsx` | Shared event form dialog (create + edit) |

## Modified Files Summary

| File | Change |
|------|--------|
| `src/collections/ForumThreads.ts` | Add `isDeleted`, `isEdited`, `editedAt` fields |
| `src/collections/ForumReplies.ts` | Add `isDeleted`, `isEdited`, `editedAt` fields |
| `src/server/api/routers/forum.ts` | Add `editThread`, `deleteThread`, `editReply`, `deleteReply`; update `getThreads` to filter deleted |
| `src/server/api/routers/events.ts` | Add `updateEvent`, `cancelEvent` |
| `src/components/forum/thread-detail.tsx` | Add edit/delete UI for thread author + moderators |
| `src/components/forum/reply-list.tsx` | Add edit/delete kebab menu per reply |
| `src/components/forum/reply-form.tsx` | No changes |
| `src/app/[locale]/communities/[slug]/events/page.tsx` | Add edit/cancel buttons, refactor form to shared component |
| `src/components/communities/join-button.tsx` | Hide leave button for owners |
| `src/components/communities/community-header.tsx` | Pass `memberRole` to JoinButton |
| `messages/en.json` | Add translation keys |
| `messages/nl.json` | Add translation keys |

## Translation Keys Needed

```
forum.edit
forum.delete
forum.deleteConfirm
forum.deleteThreadConfirm
forum.deleteReplyConfirm
forum.threadDeleted
forum.replyDeleted
forum.edited
forum.editing
forum.save
forum.cancel
forum.threadEdited
forum.replyEdited
forum.threadDeletedMessage  (displayed text: "[This thread has been deleted]")
forum.replyDeletedMessage   (displayed text: "[This reply has been deleted]")
events.editEvent
events.cancelEvent
events.cancelEventConfirm
events.eventUpdated
events.eventCancelled
events.cancelled
communities.settings.ownership.title
communities.settings.ownership.description
communities.settings.ownership.warning
communities.settings.ownership.selectMember
communities.settings.ownership.transfer
communities.settings.ownership.confirmTitle
communities.settings.ownership.confirmDescription
communities.settings.ownership.confirmButton
communities.settings.ownership.transferred
```
