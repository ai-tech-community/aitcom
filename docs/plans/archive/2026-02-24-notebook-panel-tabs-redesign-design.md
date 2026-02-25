# Notebook Panel & Dashboard Tabs Redesign

**Goal:** Replace the dashboard Notebook tab with a LinkedIn-style persistent floating chat panel available site-wide, and restyle the dashboard tabs to match the brutalist monospace design system.

**Architecture:** The notebook panel becomes a client component rendered at the root locale layout level (visible on every page when signed in). The dashboard tabs are restyled with 4 remaining items (Feed, Agent, Events, Settings) using the existing monospace/uppercase design tokens.

---

## 1. Persistent Notebook Panel

### Placement

- Rendered in `src/app/[locale]/layout.tsx`, after `<Footer />`, before `<Toaster />`
- Only rendered when user is signed in (client-side session check via `authClient.useSession()`)
- Only rendered when user has an agent configured (tRPC query)
- New component: `src/components/notebook-panel.tsx` (client component)

### Visual Style

Matches existing dialog system (`sponsor-application-modal.tsx`, `ui/dialog.tsx`):

- `rounded-lg border border-border bg-background shadow-lg`
- Header: `font-mono text-sm tracking-wider` (same as `DialogTitle`)
- Close/minimize buttons: `XIcon` / `ChevronDownIcon` with `opacity-70 hover:opacity-100` pattern
- Z-index: `z-40` (below navbar z-50, above page content)

### States

**Hidden** — No session or no agent configured. Panel does not render.

**Collapsed (default)** — A pill fixed to `bottom-4 right-4`:

- `rounded-lg border border-border bg-background shadow-lg`
- Contains: `MessageSquareIcon`, "NOTEBOOK" label (mono, uppercase, tracking-wider), unread badge (orange pill, same style as current tab badge)
- Clicking expands the panel
- Approximately 200px wide

**Expanded** — A chat panel fixed to `bottom-4 right-4`:

- `w-[380px] h-[500px] rounded-lg border border-border bg-background shadow-lg`
- Header: `border-b border-border px-4 py-3` with `/ NOTEBOOK` section label + minimize (ChevronDown) and close (X) buttons
- Messages area: Scrollable, reuses `Conversation`, `ConversationContent`, `Message`, `MessageContent`, `MessageResponse` from ai-elements
- Input: `border-t border-border p-3`, reuses `PromptInput`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputSubmit`
- Mark-as-read on expand (same behavior as current notebook page)

**Mobile (<640px):** Expanded panel uses `fixed inset-x-4 bottom-4 top-20` (below navbar).

### Data Flow

- Unread count: `api.notebook.unreadCount.useQuery` with 30s polling (same as current tab badge)
- Messages: `api.notebook.getMessages.useQuery({ limit: 50 })`
- Send: `api.notebook.sendMessage.useMutation` with invalidation
- Mark read: `api.notebook.markRead.useMutation` on expand

---

## 2. Dashboard Tabs Restyle

### Changes

- **Remove Notebook tab** — replaced by the persistent panel
- **4 remaining tabs:** Feed, Agent, Events, Settings
- **Remove sticky positioning** — tabs are inside the dashboard container, not page-level

### Visual Style

Match the brutalist monospace aesthetic used in section headers (`/ SECTION NAME`):

- Labels: `font-mono text-xs font-medium tracking-wider uppercase`
- Active state: `text-foreground bg-secondary/50 rounded` subtle background
- Inactive state: `text-muted-foreground hover:text-foreground`
- Icons: `h-4 w-4`, tight gap with label
- Remove `border-b-2` active indicator
- Consistent padding: `px-3 py-2`

---

## 3. Cleanup

- Remove `src/app/[locale]/dashboard/notebook/page.tsx` (notebook is now the panel)
- Remove notebook-related i18n keys that are no longer needed, or repurpose them for the panel
- Remove unread polling from `dashboard-tabs.tsx` (moved to notebook panel)

---

## 4. Files Affected

| Action | File |
|--------|------|
| Create | `src/components/notebook-panel.tsx` |
| Modify | `src/app/[locale]/layout.tsx` (add NotebookPanel) |
| Modify | `src/components/dashboard-tabs.tsx` (restyle, remove notebook tab) |
| Delete | `src/app/[locale]/dashboard/notebook/page.tsx` |
| Modify | `messages/en.json` (add panel-specific keys if needed) |
| Modify | `messages/nl.json` (same) |
