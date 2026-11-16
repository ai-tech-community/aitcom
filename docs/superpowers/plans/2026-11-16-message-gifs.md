# Message GIFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can send a GIPHY GIF, with or without words, in person-to-person (`dm`) and room (`space`) conversations, using the feed's GIF search, picker and player.

**Architecture:** GIF search becomes its own `gifs` tRPC router open to any signed-in member (same per-member limit), and the GIPHY lookup helpers move from the feed's `post-media.ts` to `src/server/giphy/`. The feed's GIF picker and picked-media tile move to `src/components/composer/`, its GIF player to `src/components/media/`. A message's GIF is a row in a new `app.message_attachment` table (one row per attachment, so photos in PR 3 are new rows of the same table). One server seam, `insertMemberMessage`, writes a member's message and its attachment in one transaction for both the room and the dm/agent branch of `sendMessage`. One client `MessageBody` draws a message (text, interactive UI, attachments) in all three inbox views.

**Tech Stack:** Next.js 15 App Router, React 19, tRPC, Drizzle (`app` schema) with hand-written Payload migrations, next-intl (en/fr/nl), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-richer-message-composer-design.md` (GIFs / PR 2 section). Issue #584. Builds on PR #585 (`MessageComposer`, `useSendMessage`, `src/components/composer/`).

## Global Constraints

- Branch `feat/message-gifs`. Never run `git checkout`, `git switch`, `git stash`, `git add -A` or `git add .`. Stage files by name. Check `git branch --show-current` before every commit.
- Use `git mv` for moved files so history follows them.
- No commit trailers of any kind (no `Co-Authored-By`, no "Generated with").
- `.env` points at production. Never run `pnpm build`, `pnpm db:apply`, `pnpm dev`, `payload migrate`, `drizzle-kit`, or anything that reads `.env` against a database. The only database allowed is the local test DB below.
- Local DB tests: `aitcom_test` on `127.0.0.1:55432` (never port 5432, which is a tunnel to a remote DB). Env: `RUN_DB_TESTS=1 NEON_LOCAL_PROXY=127.0.0.1:5433 SKIP_ENV_VALIDATION=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`, with `unset PAYLOAD_PUSH`. If Docker or that DB is not running, say so in your report and skip the DB run; do not point at any other database.
- Schema: hand-written, idempotent, additive migration in `src/migrations/` registered in `src/migrations/index.ts`; `src/server/db/schema.ts` mirrors it. Newest existing migration is `20261114d_media_avatar_purpose`.
- Translation files `messages/en.json`, `messages/fr.json`, `messages/nl.json`; `src/i18n/messages-parity.test.ts` stays green. Moved strings keep their current values in all three languages. Before deleting a key from its old namespace, grep `src` for other users of it there; if any remain, keep it there too.
- GIPHY terms: the picker keeps its "POWERED BY GIPHY" line; GIFs are never copied to our storage; a message stores only addresses the server read from GIPHY by id.
- Agent (`agent`) conversations take no attachments: no GIF button, and the server refuses one.
- Design rules (DESIGN.md): Signal Orange only on the send button; toolbar icons are ghost `ToolbarButton`s.

## Review Focus

1. A send with a GIF fails: the GIF stays picked and the words come back, so pressing Send again resends both. (Test in Task 5.)
2. An agent conversation: no GIF button, and `sendMessage` with a `gif` into an agent conversation is refused with `BAD_REQUEST` and stores nothing. (Tests in Tasks 3 and 5.)
3. A GIF-only message: the conversation lists show "GIF" as its preview (not a blank line), and the agent owner-DM reader sees `[GIF: <title>]`. (Tests in Tasks 4 and 6.)
4. Enter pressed in the GIF search box does not send the message. (Test in Task 5.)
5. A GIF in the small floating chat window fits inside the bubble (height capped) and shows its still frame for reduced motion. (Test in Task 2; check by eye in the PR browser pass.)

---

### Task 1: GIF search open to every member; GIPHY lookup out of the feed

**Files:**
- Create: `src/server/giphy/gif-lookup.ts`, `src/server/api/routers/gifs.ts`, `src/server/api/routers/gifs.test.ts`
- Modify: `src/server/communities/post-media.ts` (remove `gifFields`, `lookUpGif`), `src/server/api/routers/feed.ts` (imports; remove `searchGifs` and `checkGifSearchLimit`; `createPost` `gifId` uses `giphyIdSchema`), `src/server/api/root.ts` (register `gifs`), `src/components/communities/feed/editor/gif-picker-button.tsx` (+ test: query `api.gifs.search`, no `communitySlug` in the query input; the prop stays until Task 2), `src/server/api/routers/feed-post-writes.test.ts` and any other test mocking the moved functions or `feed.searchGifs` (grep `searchGifs\|lookUpGif\|gifFields`)

**Interfaces:**
- Produces:
  - `src/server/giphy/gif-lookup.ts`: `type StoredGif = Omit<Gif, "preview">`; `gifFields(gif: Gif): StoredGif` and `lookUpGif(getGiphy: (() => GiphyClient) | undefined, giphyId: string): Promise<Gif>` moved verbatim with their doc comments (wording "a post" → "a post or a message"); `giphyIdSchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/)` (the regex `createPost` uses today).
  - `gifs` router: `search` — `protectedProcedure`, input `{ query: string max 50 default "", cursor: int 0..4999 nullish, lang: enum(routing.locales) default "en" }`, output `{ gifs: Gif[]; nextCursor: number | null }`. Same body as today's `feed.searchGifs` minus `requireFeedPoster`. The 60-per-hour `checkGifSearchLimit` moves into this file with its comment.
  - `feed.searchGifs` no longer exists.

- [ ] **Step 1: Write failing tests** in `gifs.test.ts` (mock `@/server/giphy/giphy`'s `getGiphyClient` to a fake client; call through `createCaller` the way `feed-post-writes.test.ts` builds its caller):
  - `search returns trending without a query`: fake `trending` called with `{ offset: 0 }`, result `{ gifs, nextCursor }`.
  - `search passes the trimmed query and language`: input `{ query: "  cat ", lang: "fr" }` → `search({ query: "cat", offset: 0, lang: "fr" })`.
  - `search needs no community`: a signed-in member with no community memberships gets results.
  - `search refuses the 61st call in an hour`: 60 calls pass, the 61st throws `TOO_MANY_REQUESTS`.
  - In `gif-picker-button.test.tsx`: `searches without a community`: the mocked `api.gifs.search.useInfiniteQuery` is called with an input that has no `communitySlug` key (`expect(input).not.toHaveProperty("communitySlug")`).
- [ ] **Step 2: Run** `pnpm vitest run src/server/api/routers/gifs.test.ts src/components/communities/feed/editor/gif-picker-button.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the module, router, root registration; move, don't copy; fix importers and tests that used the moved names.
- [ ] **Step 4: Run** `pnpm vitest run src/server/api/routers src/server/communities src/server/giphy src/components/communities/feed` → PASS; `pnpm exec tsc --noEmit -p .` → clean; eslint on changed files → clean.
- [ ] **Step 5: Commit**: `feat(gifs): GIF search for every signed-in member, GIPHY lookup out of the feed`.

### Task 2: Shared GIF picker, picked-media tile and GIF player

**Files:**
- Move (`git mv`): `src/components/communities/feed/editor/gif-picker-button.tsx` (+ `.test.tsx`) → `src/components/composer/gif-picker-button.tsx` (+ test)
- Move (`git mv`): `src/components/communities/feed/media-preview.tsx` → `src/components/composer/media-preview.tsx`
- Move (`git mv`): `src/components/communities/feed/feed-gif.tsx` (+ `.test.tsx`) → `src/components/media/gif-player.tsx` (+ `gif-player.test.tsx`)
- Modify: importers (`post-composer.tsx`, `post-edit-form.tsx`, `feed-post-card.tsx`, their tests' `vi.mock` paths), `messages/*.json`

**Interfaces:**
- Consumes: `api.gifs.search` (Task 1).
- Produces:
  - `GifPickerButton({ label?, onPick, disabled })` — `communitySlug` removed; queries `api.gifs.search`; `label` defaults to `t("gif")`. `type PickedGif = RouterOutputs["gifs"]["search"]["gifs"][number]`. `gifColumns` unchanged.
  - `MediaPreview` — unchanged props; doc comment says "a post or message".
  - `GifPlayer({ gif, size = "feed" }: { gif: GifView; size?: "feed" | "message" })` — renamed from `FeedGif` / `FeedGifView`. `"feed"` keeps `max-h-96`; `"message"` caps the figure and media at `max-h-60`.
  - Translation namespaces:
    - `composer` gains, moved from `communities.feed.editor`: `gif`, `gifs`, `gifSearch`, `gifTrending`, `gifNone`, `gifError`, `gifMore`, `gifUntitled`, `poweredByGiphy`, `gifBusy`, `gifUnavailable`, `gifGone`, `gifCount`, `gifClear`, `gifResultsFor`, `tryAgain`; and from `communities.feed`: `removeGif`.
    - New top-level `media` namespace, moved from `communities.feed`: `gifBadge`, `gifGone`, `playGif`, `pauseGif`.
    - The grep rule in Global Constraints decides which keys also stay behind (e.g. `tryAgain`, `gifBadge`).

- [ ] **Step 1: Write failing tests**:
  - In `gif-player.test.tsx` (moved file, update import): `message size caps the height`: render `size="message"` → the `figure` has class `max-h-60`, not `max-h-96`.
  - In `gif-picker-button.test.tsx` (moved file): `uses its own label by default`: rendered without `label` → a button named `gif` (keys-as-text mock).
- [ ] **Step 2: Run** `pnpm vitest run src/components/composer src/components/media` → FAIL.
- [ ] **Step 3: Implement** the moves, prop changes, renames and string moves; the feed passes only its "Replace with GIF" label.
- [ ] **Step 4: Run** `pnpm vitest run src/components/composer src/components/media src/components/communities/feed src/i18n` → PASS; `pnpm exec tsc --noEmit -p .` → clean; `pnpm exec eslint <changed files>` → clean.
- [ ] **Step 5: Commit**: `refactor(composer): move the GIF picker, media tile and GIF player out of the feed`.

### Task 3: Messages carry a GIF

**Files:**
- Create: `src/migrations/20261116a_message_attachments.ts`, `src/server/inbox/message-attachments.ts`, `src/server/inbox/member-message.ts`, `src/server/inbox/message-attachments.integration.test.ts`, `src/server/inbox/message-attachments.test.ts`
- Modify: `src/migrations/index.ts`, `src/server/db/schema.ts` (table + relations after `messages`), `src/server/api/routers/inbox.ts` (`sendMessage`, `getMessages`)

**Interfaces:**
- Produces:
  - Table `app.message_attachment`: `id varchar(255) PK`, `message_id varchar(255) NOT NULL REFERENCES app.message(id) ON DELETE CASCADE`, `position smallint NOT NULL DEFAULT 0`, `kind varchar(10) NOT NULL CHECK (kind IN ('gif','photo'))`, `giphy_id varchar(64)`, `title text`, `mp4_url text`, `still_url text`, `width integer`, `height integer`, `created_at timestamptz NOT NULL DEFAULT now()`; `UNIQUE (message_id, position)`; `CHECK (kind <> 'gif' OR (giphy_id IS NOT NULL AND mp4_url IS NOT NULL AND still_url IS NOT NULL))`. Drizzle: `messageAttachments`.
  - `message-attachments.ts`:
    - `type MessageAttachmentView = { id: string; kind: "gif"; position: number; title: string; mp4Url: string; stillUrl: string; width: number; height: number }` (PR 3 widens it to a union).
    - `loadAttachments(db, messageIds: string[]): Promise<Map<string, MessageAttachmentView[]>>` — one query, ordered by position; no query for an empty list.
    - `withAttachments<T extends { id: string }>(db, rows: T[]): Promise<Array<T & { attachments: MessageAttachmentView[] }>>`.
    - `attachmentStandIn(attachments: MessageAttachmentView[]): string` — `"[GIF: <title>]"`, or `"[GIF]"` when the title is empty; `""` for none.
    - `textForReaders(content: string, attachments: MessageAttachmentView[]): string` — content and stand-in joined by `"\n"`, either side omitted when empty.
  - `member-message.ts`: `insertMemberMessage(db, input: { conversationId: string; senderId: string; content: string; uiResource?: UiResource; gif: StoredGif | null }): Promise<typeof messages.$inferSelect & { attachments: MessageAttachmentView[] }>` — one `db.transaction`: the message insert both branches of `sendMessage` do today (including `uiProducerTrust`), then the GIF row at position 0.
  - `sendMessage` input: `content: z.string().max(MESSAGE_MAX_LENGTH)`, `gif: z.object({ giphyId: giphyIdSchema }).optional()`, refined: `content.trim()` non-empty or `gif` present (`BAD_REQUEST`, "A message needs words or a GIF."). Order: access check → refuse `gif` in an `agent` conversation (`BAD_REQUEST`, "GIFs can't be sent to an agent.") → `lookUpGif(getGiphyClient, …)` → `insertMemberMessage`. Returns the message with `attachments`; the realtime payload carries the same object.
  - `getMessages` returns each message with `attachments` (via `withAttachments`).

- [ ] **Step 1: Write failing tests**:
  - `message-attachments.test.ts` (pure): `attachmentStandIn` → `"[GIF: Happy dance]"`, `"[GIF]"` for an empty title, `""` for none; `textForReaders("hi", [gif])` → `"hi\n[GIF: Happy dance]"`; `textForReaders("", [gif])` → `"[GIF: Happy dance]"`; `textForReaders("hi", [])` → `"hi"`.
  - `message-attachments.integration.test.ts` (DB, `RUN_DB_TESTS` gate as in `src/server/communities/spaces.integration.test.ts`; GIPHY stubbed with a fake `getGiphyClient` returning the `Gif` fixture used in `feed-post-writes.test.ts`):
    - `a dm message with a GIF stores one gif attachment and getMessages returns it`.
    - `a GIF-only message is accepted` (`content: ""`).
    - `a message with no words and no GIF is refused` (`BAD_REQUEST`).
    - `a room message with a GIF reaches getMessages for another room member`.
    - `a GIF into an agent conversation is refused and stores no message` (count rows before and after).
    - `a GIF GIPHY does not know is refused and stores no message`.
- [ ] **Step 2: Run** `pnpm vitest run src/server/inbox/message-attachments.test.ts` → FAIL; with the local DB env, the integration file → FAIL.
- [ ] **Step 3: Implement** the migration (template `20261101a_referral_email_invites.ts`; `down` drops the table), schema, the two modules, and the router changes. Apply the migration to `aitcom_test` only, with a one-off `tsx` script in the scratchpad that imports the migration's `up` and runs it against that `DATABASE_URL`; never `db:apply`.
- [ ] **Step 4: Run** the unit test → PASS; integration test with the local DB env → PASS (or report the DB as unavailable); `pnpm vitest run src/server src/migrations` → PASS; `tsc`, eslint clean.
- [ ] **Step 5: Commit**: `feat(inbox): a message can carry a GIF`.

### Task 4: Every reader of messages knows about attachments

**Files:**
- Modify: `src/server/api/routers/inbox.ts` (`listConversations` last message, `agentGetOwnerDMs`), `src/server/members/delete-account.ts` (~L205), `src/server/inbox/message-attachments.integration.test.ts`, `src/server/members/` delete-account test (whichever covers the message blanking; grep `"[deleted]"`)

**Interfaces:**
- Consumes: `loadAttachments`, `textForReaders` (Task 3).
- Produces:
  - `listConversations` → `lastMessage` gains `attachmentKind: "gif" | null` (kind of its first attachment). One `loadAttachments` call for the page's last messages, not one per conversation.
  - `agentGetOwnerDMs` → each row's `content` is `textForReaders(content, attachments)`. (`agentCheckInbox`, `agentGetConversationHistory` and `agent.ts` notifications read only agent conversations, which never hold attachments; leave them.)
  - Account deletion also deletes the member's message attachments, inside the same transaction as the message blanking.

- [ ] **Step 1: Write failing tests** (integration file from Task 3 and the delete-account test):
  - `listConversations marks a GIF-only last message`: `lastMessage.content === ""`, `attachmentKind === "gif"`.
  - `agentGetOwnerDMs shows a GIF as text`: an owner DM with GIF "Happy dance" and no words → `content === "[GIF: Happy dance]"`.
  - `deleting an account removes the member's message attachments`: zero `message_attachment` rows for that member's messages afterwards.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the integration file (local DB env) and `pnpm vitest run src/server` → PASS; `tsc`, eslint clean.
- [ ] **Step 5: Commit**: `feat(inbox): previews, agent reads and account deletion know about GIFs`.

### Task 5: Pick and send a GIF from the message composer

**Files:**
- Modify: `src/components/inbox/use-send-message.ts`, `src/components/inbox/use-send-message.test.tsx`, `src/components/inbox/message-composer.tsx`, `src/components/inbox/message-composer.test.tsx`, `src/components/inbox/chat-window.tsx`, `src/components/messages/conversation-view.tsx`, `src/components/inbox/inbox-mobile-view.tsx`

**Interfaces:**
- Consumes: `GifPickerButton`, `PickedGif`, `MediaPreview` (Task 2); `sendMessage` `gif` input and `attachments` output (Task 3).
- Produces:
  - `type MessageDraft = { content: string; gif?: PickedGif | null }` exported from `use-send-message.ts`; `send(draft: MessageDraft): Promise<void>` replaces `send(content)`. It trims the words; does nothing when no words and no GIF; sends `{ conversationId, content, gif: gif ? { giphyId } : undefined }`. The optimistic row has `attachments: []`, or one `MessageAttachmentView` built from the picked GIF (`id: "optimistic-gif"`, `position: 0`).
  - `MessageComposer({ conversationId, placeholder, kind }: { …; kind: "agent" | "person" })`. For `"person"`, `GifPickerButton` sits after `EmojiPickerButton`. A picked GIF shows as `MediaPreview` (`src = gif.preview.stillUrl`, `badge = t("media.gifBadge")`, `removeLabel = t("composer.removeGif")`) above the text field; removing it returns focus to the GIF button. Picking another GIF replaces it. On success the GIF is cleared; on failure it stays and the words come back as today (skip the text restore when the words were empty). Failure toast: `composer.gifGone` for `BAD_REQUEST` with a GIF, `composer.gifUnavailable` for `PRECONDITION_FAILED`, otherwise `inbox.sendFailed`.
  - Surfaces pass `kind={isAgent ? "agent" : "person"}` (`chat-window` prop, `conversation-view` `peer.isAgent`, mobile `chatInfo.isAgent`; rooms reach it through `ConversationView`).

- [ ] **Step 1: Write failing tests**:
  - `use-send-message.test.tsx`: `sends the GIF id with the words`; `sends a GIF with no words` (`content: ""`); `sends nothing without words or GIF`; `the optimistic row shows the picked GIF` (cache row's `attachments[0].mp4Url` equals the picked GIF's).
  - `message-composer.test.tsx` (mock `@/components/composer/gif-picker-button` with a button labeled `gif` that calls `onPick(fixtureGif)` and renders an `<input>` labeled `gif search`):
    - `no GIF button in an agent conversation`.
    - `a picked GIF shows with a remove button, and removing it clears it`.
    - `sends a GIF-only message`: pick, press Enter in the textarea → `send` called with `{ content: "", gif: fixtureGif }`.
    - `Enter in the GIF search does not send`.
    - `a failed send keeps the GIF and the words`: `send` rejects once → the preview is still shown, the textarea holds the words; Enter again → `send` called a second time with the same draft.
    - `a successful send clears the GIF`.
- [ ] **Step 2: Run** `pnpm vitest run src/components/inbox` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm vitest run src/components/inbox src/components/messages` → PASS; `tsc`, eslint clean.
- [ ] **Step 5: Commit**: `feat(inbox): pick and send a GIF in person and room conversations`.

### Task 6: One message body and GIF previews in every view

**Files:**
- Create: `src/components/inbox/message-body.tsx`, `src/components/inbox/message-body.test.tsx`, `src/components/inbox/message-preview.ts`, `src/components/inbox/message-preview.test.ts`
- Modify: `chat-window.tsx`, `conversation-view.tsx`, `inbox-mobile-view.tsx` (the `<MessageContent>` children), `src/components/inbox/inbox-list.tsx` (~L204), `src/components/inbox/inbox-conversation-item.tsx`, `src/components/messages/conversation-list.tsx` (~L287)

**Interfaces:**
- Consumes: `GifPlayer` (Task 2); `attachments` on messages, `attachmentKind` on last messages (Tasks 3–4).
- Produces:
  - `MessageBody({ message, isUser, conversationId }: { message: RouterOutputs["inbox"]["getMessages"]["messages"][number]; isUser: boolean; conversationId: string })` — the three views' current text branches moved here once (own words as `<p>`, a `uiResource` with `isChatUiEnabled()` as `UiMessage`, others as `MessageResponse`), then each attachment as `<GifPlayer size="message">`. Empty words render no text element. The mobile view gains the `UiMessage` branch the other two views already have.
  - `messagePreview(last: { content: string; attachmentKind: "gif" | null } | null | undefined, gifLabel: string): string | null` — the words when there are any, else `gifLabel` when `attachmentKind === "gif"`, else `null`. Both conversation lists use it (`gifLabel = t("media.gifBadge")`); the 40-character cut in `inbox-conversation-item.tsx` stays where it is.

- [ ] **Step 1: Write failing tests**:
  - `message-preview.test.ts`: words win; `""` + `"gif"` → `"GIF"`; `""` + `null` → `null`; `undefined` → `null`.
  - `message-body.test.tsx` (mock `@/components/media/gif-player` to render `data-testid="gif"`, and `ui-message`): `a GIF-only message shows the GIF and no empty paragraph`; `words and a GIF show both, words first`; `own words render as plain text` (no markdown rendering of `**x**`).
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement**; replace the three render branches and both previews.
- [ ] **Step 4: Run** `pnpm vitest run src/components/inbox src/components/messages src/components/communities` → PASS; `tsc`, eslint clean.
- [ ] **Step 5: Commit**: `feat(inbox): show GIFs in every conversation view and list`.

### Task 6b: The Messages page knows any open conversation

Added during execution (Task 5 review): `/messages` finds the open conversation's peer only inside `listConversations({ limit: 30 })`. A conversation older than the newest 30 gets a null peer, so its header shows "—" and (since Task 5's fail-safe) its composer offers no GIF.

**Files:**
- Create: `src/server/inbox/conversation-summaries.ts`, `src/server/inbox/conversation-summaries.integration.test.ts`
- Modify: `src/server/api/routers/inbox.ts` (`listConversations` uses the new module; new `getConversation`), `src/components/messages/messages-shell.tsx`, its test (create `messages-shell.test.tsx` if none)

**Interfaces:**
- Produces:
  - `conversation-summaries.ts`: the code `listConversations` runs today, split in two without behaviour change:
    - `loadConversationRows(db, userId: string, only?: { conversationId: string }): Promise<ConvRow[]>` — the caller's dm/agent participant rows plus the room rows they may read (same access checks as today), optionally narrowed to one conversation.
    - `summarizeConversations(db, userId: string, rows: ConvRow[]): Promise<ConversationSummary[]>` — the per-row build (last message with `attachmentKind`, participants, agent info, unread count, room fields), with the one batched attachment read.
    - `type ConversationSummary` — exactly today's `listConversations` item shape.
  - `listConversations` = `loadConversationRows` → sort + paginate (unchanged) → `summarizeConversations`. Output unchanged.
  - `inbox.getConversation` — `protectedProcedure`, input `{ conversationId: string }`, returns `ConversationSummary`; `NOT_FOUND` when the caller may not read it (not a participant, or not an active member of the room's space).
  - `messages-shell.tsx`: the active conversation is the listed one when present; otherwise `api.inbox.getConversation` for `activeConversationId`, queried only once the list has loaded without it. `peer` and `peerUserId` are derived the same way from either source.

- [ ] **Step 1: Write failing tests**:
  - Integration (local DB): `getConversation returns the same summary listConversations gives` (deep-equal for one dm); `getConversation finds a conversation beyond the first page` (create 31 dms, the oldest is returned); `getConversation refuses a conversation the caller is not in` (`NOT_FOUND`); `getConversation refuses a room the caller is not an active member of` (`NOT_FOUND`).
  - Component: `messages-shell` with a list that lacks the active id and a mocked `getConversation` returning a dm with a person → the composer gets `kind="person"` and the header shows the person's name; the `getConversation` query is not enabled while the list is loading or when the list has the conversation.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement.** Move code, don't copy it; `inbox.ts` shrinks by the moved block.
- [ ] **Step 4: Run** the integration file (local DB env), `pnpm vitest run src/server src/components/messages src/components/inbox` → PASS; `tsc`, eslint clean.
- [ ] **Step 5: Commit**: `fix(messages): the Messages page knows a conversation older than the newest 30`.

### Task 7: Full checks

- [ ] **Step 1:** `SKIP_ENV_VALIDATION=1 pnpm test` → PASS except the two known local-only `google-font-css.test.ts` woff2 failures; record counts. Any other failure: fix if this branch caused it, else report with output.
- [ ] **Step 2:** `pnpm exec tsc --noEmit -p .`, `pnpm lint`, `pnpm exec prettier --check <changed files>` → clean.
- [ ] **Step 3:** Commit this plan: `git add docs/superpowers/plans/2026-11-16-message-gifs.md` → `docs: message GIFs plan`.
- [ ] **Step 4:** `git status --short` → empty.
