# Inbox Messaging System — Design

**Date:** 2026-02-24
**Status:** Approved
**Approach:** Unified conversations — migrate agent notebook + add member DMs into a single inbox with LinkedIn-style multi-window UI.

## Overview

Replace the single-thread agent notebook panel with a full inbox messaging system. Members can DM any other member. The agent conversation lives in the same inbox, pinned to the top. LinkedIn-style UI: a floating inbox pill expands into a conversation list, individual chats open as separate mini windows.

## Decisions

- **1-on-1 DMs only** — no group chats or channels (future phase)
- **Open messaging** — any member can message any member, no follow requirement
- **Agent in inbox** — agent conversation is a regular thread, pinned to top of list
- **Agent DM access** — agents can read owner's DMs by default (`canReadOwnerDMs` toggle in settings)
- **LinkedIn-style windows** — inbox pill → conversation list, separate chat windows per conversation
- **Max 2 chat windows** on desktop, 1 on tablet, fullscreen on mobile
- **Unified data model** — single `conversations` + `messages` tables, migrate `notebookMessages`

---

## Data Model

### `conversations` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `type` | varchar(10) | `"agent"` or `"dm"` |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | Updated on every new message |

### `conversationParticipants` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `conversationId` | uuid FK → conversations | |
| `userId` | uuid FK → user | |
| `joinedAt` | timestamptz | |
| `lastReadAt` | timestamptz | Tracks where user has read up to |
| `isPinned` | boolean | Default `false`. Agent conversations auto-pinned for the owner |

Unique constraint on `(conversationId, userId)`. Index on `userId`.

### `messages` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `conversationId` | uuid FK → conversations | |
| `senderId` | uuid FK → user | For agent messages, this is the owner's userId |
| `senderType` | varchar(10) | `"human"` or `"agent"` |
| `content` | text | |
| `metadata` | json | Optional, for agent-structured data |
| `createdAt` | timestamptz | |

Index on `(conversationId, createdAt)`.

### `agentProfiles` changes

Add `canReadOwnerDMs` boolean column, default `true`.

### Migration

Migrate existing `notebookMessages` into `conversations` (type `"agent"`) + `messages`. Drop `notebookMessages` after. Low data volume, one-time SQL script.

---

## UI Architecture

### Desktop (>= 1024px)

Three floating elements stacking horizontally from right to left at the bottom of the viewport:

```
[Chat Window 2] [Chat Window 1] [Inbox Pill/List]
                                  ← bottom-right corner
```

**Inbox Pill (collapsed):** MessageSquareIcon + total unread badge + "INBOX" label. Click expands to inbox list.

**Inbox List (expanded):** 320px wide, ~500px tall. Header (`/ INBOX` + new message button + close chevron), search input, conversation list. Agent conversation pinned to top with bot icon on avatar. Each row: avatar, name, last message preview (truncated), relative timestamp, unread indicator.

**Chat Window:** 320px wide, ~450px tall. Header (avatar + name + minimize chevron + close X), message area (reuses `<Conversation>` / `<Message>` components), input area (reuses `<PromptInput>`). Minimized state: small pill showing avatar + name at bottom.

Max 2 chat windows open. Opening a 3rd auto-closes the oldest.

### Tablet (768px - 1023px)

Same as desktop but max 1 chat window alongside the inbox list.

### Mobile (< 768px)

Inbox pill at bottom-right. Tapping opens a **fullscreen overlay** with the conversation list. Tapping a conversation replaces the list with a **fullscreen chat view** with back arrow. No simultaneous windows.

### State Management

`InboxProvider` React context at layout level:
- `isListOpen: boolean`
- `openChats: string[]` — conversation IDs, max 2 desktop / 1 tablet / 0 mobile
- `minimizedChats: string[]` — conversation IDs
- `activeChat: string | null` — mobile fullscreen chat

---

## tRPC API

### `inbox` router — Human-facing (protectedProcedure)

| Endpoint | Description |
|----------|-------------|
| `listConversations` | My conversations ordered by `updatedAt` desc. Returns last message preview, unread count, participant info. Agent conversations flagged with `isPinned`. |
| `getMessages` | Paginated messages for a conversation (cursor-based, oldest-first). Updates `lastReadAt` on the participant row. |
| `sendMessage` | Send message in existing conversation. Updates `conversation.updatedAt`. |
| `startConversation` | Find-or-create a DM with another member. Returns conversation ID. Prevents duplicates. |
| `totalUnreadCount` | Total unread across all conversations (for pill badge). |
| `searchMembers` | Search members by name for "new message" flow. |

### `inbox` router — Agent-facing (agentProcedure)

| Endpoint | Description |
|----------|-------------|
| `agent.checkInbox` | Fetch unread human messages from agent conversation. |
| `agent.sendMessage` | Agent sends message to owner. |
| `agent.getConversationHistory` | Paginated agent ↔ owner history. |
| `agent.getOwnerDMs` | If `canReadOwnerDMs` is true, returns recent messages across owner's DM conversations. Read-only. |

### MCP Tool Updates

Existing tools (`check-inbox`, `send-notebook-message`, `get-conversation-history`) point to new `inbox.agent.*` endpoints. New tool:

| Tool | Scope | Description |
|------|-------|-------------|
| `read-owner-messages` | `read` | Fetch owner's recent DM messages (respects `canReadOwnerDMs`) |

Old `notebook.*` router removed. MCP package gets minor version bump.

---

## Component Architecture

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `InboxProvider` | `src/components/inbox/inbox-provider.tsx` | React context for open/minimized/active chat state |
| `InboxRoot` | `src/components/inbox/inbox-root.tsx` | Orchestrator — renders pill, list, chat windows based on state |
| `InboxPill` | `src/components/inbox/inbox-pill.tsx` | Collapsed state — icon + unread badge |
| `InboxList` | `src/components/inbox/inbox-list.tsx` | Conversation list panel with search + new message |
| `InboxConversationItem` | `src/components/inbox/inbox-conversation-item.tsx` | Row: avatar, name, preview, timestamp, unread dot |
| `ChatWindow` | `src/components/inbox/chat-window.tsx` | Chat panel — reuses Conversation, Message, PromptInput primitives |
| `ChatWindowMinimized` | `src/components/inbox/chat-window-minimized.tsx` | Minimized pill: avatar + name |
| `NewMessageSearch` | `src/components/inbox/new-message-search.tsx` | Member search to start a conversation |
| `InboxMobileView` | `src/components/inbox/inbox-mobile-view.tsx` | Fullscreen overlay for mobile — list + chat with back nav |

### Deleted

- `src/components/notebook-panel.tsx` — replaced by inbox components

### Modified

| File | Change |
|------|--------|
| `src/app/[locale]/layout.tsx` | Replace `<NotebookPanel />` with `<InboxProvider><InboxRoot /></InboxProvider>` |
| `src/server/api/root.ts` | Replace `notebook: notebookRouter` with `inbox: inboxRouter` |
| `src/server/db/schema.ts` | Add new tables, add `canReadOwnerDMs` to agentProfiles, drop `notebookMessages` |
| `messages/en.json` | Replace `notebook` namespace with `inbox` namespace |
| `messages/nl.json` | Same |
| MCP package | Update endpoints from `notebook.*` to `inbox.agent.*` |

### i18n Keys (`inbox` namespace)

```json
{
  "inbox": {
    "title": "Inbox",
    "search": "Search conversations...",
    "newMessage": "New message",
    "searchMembers": "Search members...",
    "noConversations": "No conversations yet",
    "noConversationsDescription": "Start a conversation with a community member or your AI agent.",
    "placeholder": "Type a message...",
    "agentLabel": "Your Agent",
    "unreadBadge": "unread messages"
  }
}
```
