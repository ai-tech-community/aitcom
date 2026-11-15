# Richer message composer: emoji, GIFs and photos

Issue: #584 · Date: 2026-11-15

## Intent

Inbox messages are plain text today. The community feed editor already lets
members add emoji, GIPHY GIFs and pictures. Messages should get the same
tools, built from the same code, so members can say more than words in a
private conversation without leaving it.

## Goals

- Emoji picker in every message composer (floating chat window, `/messages`
  page, mobile inbox view, community rooms).
- GIFs (GIPHY) in person-to-person (`dm`) and room (`space`) conversations.
- Photos, up to 4 per message, in `dm` and `space` conversations.
- A message may carry a GIF or photos with no text.

## Non-goals (this round)

Video, documents/files, voice notes, reactions, GIFs/photos in agent
conversations. Tracked on #584.

## Anti-goals

- A photo in a private message must never be reachable by a plain link.
  Public `media/` storage is wrong for it.
- No second emoji picker, GIF picker, image shrinker or upload lifecycle.
  The feed's and the gallery's are reused.
- No more copies of the composer. Every conversation surface (floating chat
  window, `/messages`, mobile inbox view, community rooms) shares one.

## Constraints

- Messages live in the Drizzle `app.message` table; schema changes are
  hand-written additive Payload migrations (`src/migrations`), applied by the
  production build on merge.
- Private files go under the S3 `private/` prefix; readers get signed GET
  links (`ObjectStorage.signedGetUrl`) only after an access check.
- Realtime follows ADR-0025 (SSE + Upstash); the client refetches on events.
- Customer copy: everyday words, en/fr/nl.
- GIPHY terms: attribution in the search UI (the feed picker already shows it).

## Approaches considered

1. **Reuse feed + gallery pieces behind shared seams (chosen).** Move the
   feed editor's generic pieces (emoji picker, GIF picker, toolbar button,
   insert-at-caret) to `src/components/composer/`; one `MessageComposer` for
   every conversation view; attachments in their own table; photo uploads
   follow the gallery's presign → upload → finish → sweep lifecycle.
2. **Import the feed pieces where they are.** Less churn, but the inbox
   would depend on `communities/feed/editor` and its translation namespace,
   and the GIF picker is hard-wired to a community-scoped search.
3. **Store attachments in `message.metadata` JSON.** No migration, but
   photos need an upload status, an owner check and an orphan sweep keyed
   by storage key; a loose JSON blob gives none of that.

## Design

### Shared composer pieces (PR 1)
- `src/components/composer/` holds `ToolbarButton`, `EmojiPickerButton`,
  `insertAtCaret` (the feed's undoable `applyEdit`). Strings move to a
  `composer` translation namespace. The feed editor imports from here.
- `src/components/inbox/message-composer.tsx` — the one composer
  (`PromptInput` + textarea + toolbar + send). `use-send-message.ts` — the
  one optimistic send hook. The four surfaces render these: the floating
  chat window, `/messages` and the mobile inbox view directly, community
  rooms through `/messages`' `ConversationView`
  (`src/components/communities/rooms/room-view.tsx`).

### GIFs (PR 2)
- New table `app.message_attachment` (one row per GIF or photo, ordered by
  `position`, `kind` = `gif` | `photo`). GIF rows hold the same fields the
  feed stores for a post GIF.
- GIF search moves to a procedure open to any signed-in member, same rate
  limit. `GifPickerButton` moves to `composer/` and no longer needs a
  community slug; feed and inbox use the same search.
- `sendMessage` accepts `content` (may be empty when an attachment exists)
  plus `gif?: { giphyId }`; the server re-fetches the GIF from GIPHY, as the
  feed does. Agent conversations refuse attachments.
- Reads (`getMessages`, list previews, emails, agent tools) carry
  attachments; text-only readers get a stand-in ("GIF", "Photo").

### Photos (PR 3)
- Keys `private/messages/<conversationId>/<attachmentId>.jpg` (+ thumbnail).
- Browser shrinks with the gallery's photo prep, asks the server for a
  presigned POST (participant check), uploads to S3, then sends the message
  with the finished attachment ids.
- `getMessages` returns signed links for participants only.
- Attachments uploaded but never sent are swept after the finish window,
  as the gallery sweep does.

## Left to the builder

File-level layout inside the modules above, test shape, exact copy wording
within the house voice.
