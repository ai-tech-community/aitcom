# Message Composer: Emoji Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members can add emoji in every inbox message composer, using the feed editor's emoji picker, through one shared message composer.

**Architecture:** The feed editor's generic pieces (toolbar button, emoji picker, undoable insert-at-caret) move to `src/components/composer/` with their own `composer` translation namespace; the feed imports them from there. The three inbox surfaces' copy-pasted composer and optimistic-send code become one `MessageComposer` component and one `useSendMessage` hook.

**Tech Stack:** Next.js 15 App Router, React 19, tRPC, next-intl (en/fr/nl), frimousse emoji picker, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-richer-message-composer-design.md` (PR 1 section). Issue #584.

## Global Constraints

- Branch `feat/message-composer-emoji`. Never run `git checkout`, `git switch`, `git stash`, `git add -A` or `git add .`. Stage files by name.
- Use `git mv` for moved files so history follows them.
- No commit trailers of any kind (no `Co-Authored-By`, no "Generated with").
- Never run `pnpm build`, `pnpm db:apply`, `pnpm dev`, or anything that reads `.env` against a database. This plan has no database work.
- Translation files: `messages/en.json`, `messages/fr.json`, `messages/nl.json`. `src/i18n/messages-parity.test.ts` must stay green (same keys in all three).
- Customer copy: everyday words. Reuse the existing feed strings verbatim; do not reword them.
- Design rules (DESIGN.md): Signal Orange only on the send button; icon buttons are ghost `ToolbarButton`s.

## Review Focus

1. Emoji picked while the textarea has never been focused: lands at the end of the text, not at position 0. (Test in Task 2.)
2. Emoji picked while text is selected: replaces the selection, caret after the emoji, and Ctrl/Cmd+Z removes it in a real browser (execCommand path). (Test in Task 1 for replacement.)
3. Sending a message that is only whitespace plus nothing else: nothing is sent. (Test in Task 2.)
4. Pressing Enter while the emoji popover's search box is focused must not send the message (the search input is outside the form's textarea). (Test in Task 2.)
5. After send, the textarea is empty and keeps focus, so the member can type the next message. (Test in Task 2.)

---

### Task 1: Shared composer module

**Files:**
- Move (`git mv`): `src/components/communities/feed/editor/toolbar-button.tsx` → `src/components/composer/toolbar-button.tsx`
- Move (`git mv`): `src/components/communities/feed/editor/emoji-picker-button.tsx` → `src/components/composer/emoji-picker-button.tsx`
- Create: `src/components/composer/text-edit.ts`
- Create: `src/components/composer/text-edit.test.ts`
- Modify: `src/components/communities/feed/editor/use-post-text.ts` (remove local `applyEdit`, import it)
- Modify: every importer of the two moved files (`post-composer.tsx`, `post-edit-form.tsx`, `editor/gif-picker-button.tsx`, `editor/mention-picker.tsx`, `editor/post-editor.tsx`, `editor/format-buttons.tsx` — grep `toolbar-button\|emoji-picker-button` to be sure)
- Modify: `messages/en.json`, `messages/fr.json`, `messages/nl.json`

**Interfaces:**
- Produces:
  - `applyEdit(field: HTMLTextAreaElement | null, next: TextEdit, setValue: (value: string) => void): void` — moved verbatim from `use-post-text.ts` (with its doc comment). `TextEdit` stays imported from `@/lib/post-format`.
  - `insertAtCaret(field: HTMLTextAreaElement | null, text: string, setValue: (value: string) => void): void` — replaces the field's selection with `text`, caret after it, via `applyEdit`. When `field` is null it calls `setValue(text)`. `usePostText.insert` becomes a one-line call to it.
  - `EmojiPickerButton({ onPick, disabled })` — unchanged props; now `useTranslations("composer")`.
  - `ToolbarButton`, `ToolbarSeparator`, `ShortcutHint`, `SEND_SHORTCUTS` — unchanged exports from the new path.

- [ ] **Step 1: Write failing tests** in `src/components/composer/text-edit.test.ts` (jsdom):
  - `insertAtCaret inserts at the caret`: textarea value `"Hello world"`, `setSelectionRange(5, 5)`, insert `"🎉"` → value `"Hello🎉 world"`, `selectionStart === selectionEnd === 7` after `requestAnimationFrame` flush (use `vi.useFakeTimers` or stub rAF to run synchronously).
  - `insertAtCaret replaces the selection`: `"Hello world"`, selection `(6, 11)`, insert `"🎉"` → `"Hello 🎉"`.
  - `insertAtCaret with no field hands the text to setValue`: `insertAtCaret(null, "🎉", setValue)` → `setValue` called with `"🎉"`.
  - jsdom has no `document.execCommand` insertText; the fallback path sets the value through `setValue`. Pass a `setValue` that writes `field.value` so the assertions see the result.
- [ ] **Step 2: Run** `pnpm vitest run src/components/composer/text-edit.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** `git mv` both files; create `text-edit.ts` with `applyEdit` (moved, not copied) and `insertAtCaret`; make `usePostText` import `applyEdit` and use `insertAtCaret` in `insert`; fix all imports.
- [ ] **Step 4: Move translations.** Create a top-level `composer` namespace in all three locale files holding exactly these keys, moved (not copied) from `communities.feed.editor` with their current values: `emoji`, `emojiSearch`, `emojiLoading`, `emojiNone`, `emojiPickHint`, `skinTone`. Before deleting each key from `communities.feed.editor`, grep `src` for any other `t("<key>")` using the `communities.feed.editor` namespace and keep the key there if one exists.
- [ ] **Step 5: Run** `pnpm vitest run src/components/composer src/components/communities/feed src/i18n` → PASS. Run `pnpm exec tsc --noEmit -p .` → no errors. Run `pnpm lint` on changed files (`pnpm exec eslint <files>`) → clean.
- [ ] **Step 6: Commit** (stage by name, including the `git mv` paths and the three locale files): `refactor(composer): move toolbar button, emoji picker and caret edits out of the feed editor`.

### Task 2: One message composer with emoji, used by all three inbox surfaces

**Files:**
- Create: `src/components/inbox/use-send-message.ts`
- Create: `src/components/inbox/message-composer.tsx`
- Create: `src/components/inbox/message-composer.test.tsx`
- Modify: `src/components/inbox/chat-window.tsx` (send mutation ~L91-134, composer ~L300-311)
- Modify: `src/components/messages/conversation-view.tsx` (send mutation ~L78-119, composer ~L308-319)
- Modify: `src/components/inbox/inbox-mobile-view.tsx` (send mutation ~L73-129, composer ~L258-268)

**Interfaces:**
- Consumes: `EmojiPickerButton`, `insertAtCaret` from Task 1.
- Produces:
  - `useSendMessage(conversationId: string): { send: (content: string) => Promise<void>; isPending: boolean }` — the optimistic `api.inbox.sendMessage` mutation now duplicated in the three files (onMutate optimistic row with key `{ conversationId, limit: 50 }`, rollback onError, invalidate `getMessages`/`listConversations`/`totalUnreadCount` onSettled), moved here once. `send` trims and does nothing for empty text.
  - `MessageComposer({ conversationId, placeholder }: { conversationId: string; placeholder: string })` — renders `PromptInput` + `PromptInputTextarea` (`className="min-h-10 text-sm"`) + `PromptInputFooter` with `PromptInputTools` on the left holding `EmojiPickerButton`, and `PromptInputSubmit disabled={isPending}` on the right. Holds a ref to the textarea and passes `onPick={(emoji) => insertAtCaret(ref.current, emoji, (v) => { if (ref.current) ref.current.value = v; })}`. The surfaces keep their own wrapper `div` and its classes; only the inner `PromptInput…` block and the send hook are replaced.
  - Later PRs add GIF and photo buttons to `MessageComposer` and a `kind: "agent" | "person"` prop; do not add those now.

- [ ] **Step 1: Write failing tests** in `message-composer.test.tsx`. Mock `next-intl` the way `src/components/communities/feed/editor/post-editor.test.tsx` does (keys as text). Mock `./use-send-message` to return `{ send: vi.fn().mockResolvedValue(undefined), isPending: false }` and assert on the `send` call (not on rendered output). Mock `@/components/composer/emoji-picker-button` with a button labeled `emoji` that calls `onPick("🎉")`. Tests:
  - `inserts a picked emoji at the end when the field was never focused`: type nothing, click `emoji` → textarea value `"🎉"`.
  - `inserts a picked emoji at the caret`: type `"Hi there"`, set selection `(2, 2)`, click `emoji` → `"Hi🎉 there"`.
  - `sends the trimmed text on Enter`: type `"  hello  "`, press Enter → `send` called once with `"hello"`.
  - `sends nothing for whitespace`: type `"   "`, press Enter → `send` not called.
  - `Enter outside the textarea does not send`: render an `<input>` inside the mocked emoji popover stub, press Enter in it → `send` not called.
  - `clears the field after sending`: after the Enter send resolves, textarea value `""`.
- [ ] **Step 2: Run** `pnpm vitest run src/components/inbox/message-composer.test.tsx` → FAIL (module missing).
- [ ] **Step 3: Implement** `use-send-message.ts` and `message-composer.tsx`. If `ToolbarButton`'s `Tooltip` needs a `TooltipProvider` that the inbox tree lacks, wrap the toolbar in the same provider the feed composer uses (check how `post-composer.tsx` gets one) rather than dropping the tooltip.
- [ ] **Step 4: Replace** the three surfaces' mutation + `handleSubmit` + `PromptInput` block with `<MessageComposer conversationId={…} placeholder={t("placeholder")} />`. Remove now-unused imports. Keep each surface's wrapper div unchanged.
- [ ] **Step 5: Run** `pnpm vitest run src/components/inbox src/components/messages src/components/communities/feed` → PASS. `pnpm exec tsc --noEmit -p .` → clean. `pnpm exec eslint` on changed files → clean.
- [ ] **Step 6: Commit**: `feat(inbox): one message composer for every inbox view, with an emoji picker`.

### Task 3: Full checks and spec commit

- [ ] **Step 1:** `pnpm test` (whole unit suite) → PASS; record the pass count. Any failure: fix if caused by this branch, otherwise report it with output.
- [ ] **Step 2:** `pnpm exec tsc --noEmit -p .` and `pnpm lint` → clean.
- [ ] **Step 3:** Commit the spec and this plan: `git add docs/superpowers/specs/2026-11-15-richer-message-composer-design.md docs/superpowers/plans/2026-11-15-message-composer-emoji.md` → `docs: richer message composer design and emoji plan`.
- [ ] **Step 4:** `git status --short` → empty.
