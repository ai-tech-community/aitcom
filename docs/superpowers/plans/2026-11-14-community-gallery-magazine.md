# Community Gallery — Slice 4 (Magazine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Magazine editors can feature single gallery photos and videos whose uploader agreed, each reader sees only what the gallery lets them see, auto-drafts can suggest a highlight per recent event — and the gallery's rollout flag is deleted.

**Architecture:** A new issue item kind `galleryItem` in the ADR-0043 registry (block, strategy, picker, suggester, renderer, builder entry). Its `load` checks every item against the reader's **gallery viewer** (the gallery's own read rule) plus consent and hidden state, and signs file URLs only after that check. One shared predicate decides "featurable" for the picker, `acceptNew` and the suggester.

**Tech Stack:** Next.js, Payload CMS 3, tRPC, Drizzle, next-intl (en/nl/fr), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-community-gallery-design.md` — section "Magazine" incl. "Settled 14 Nov (slice 4)". ADRs 0043, 0044, 0047.

## Global Constraints

- Branch `feat/community-gallery-magazine` (from main). Never `git checkout`/`switch`/`stash`/`add -A`/`add .`; check `git branch --show-current` before every commit.
- Never run `pnpm dev`, `pnpm build`, `db:apply*`, `payload migrate`, or anything reading `.env` (production). DB tests gated on `RUN_DB_TESTS=1`; the controller runs them.
- Migration: `20261114b_magazine_gallery_items` (table `magazine_issues_blocks_gallery_item` per `20261026b_magazine_platform_items.ts` incl. `"image" jsonb` and `gallery_item_id numeric NOT NULL`, no FK on the reference — ADR-0044 D1), registered last in `src/migrations/index.ts` (if PR #572's `20261114a` is merged first, keep both in date order). Add the table to `GUARDED_PAYLOAD_TABLES`. Regenerate `src/payload-types.ts`.
- Kind id `galleryItem`; block slug `galleryItem`; reference `galleryItemId`; auto-draft source id `galleryItems`; suggestion reason `galleryHighlight`.
- Signed URLs only after the per-reader check, never stored (blocks, auto-pick reasons, agent output).
- Copy in en/nl/fr; DESIGN.md binds the UI. No AI credit lines.

## Review Focus

1. **A members-only photo reaches a reader who can't see it** — anonymous or non-member reader of a public issue in a listed community gets `no_access` for a `community` item (the magazine's community rule alone would let it through). Tests in Task 1.
2. **A withdrawn or hidden photo still shows** — consent withdrawn / hidden after placement → unavailable for everyone incl. moderator editors. Tests in Task 1.
3. **Picker / acceptNew / suggester disagree** — one shared predicate; a test feeds the same fixtures to all three. Tasks 1–2.
4. **A signed URL leaks into storage** — saving an issue with a gallery item stores only `galleryItemId` (+ intro); auto-pick reasons carry no URL. Tests in Tasks 1–2.
5. **Removing the flag leaves a dead gate or a broken test** — every reference in the list is gone; the Gallery tab shows in `spaces.list` for every community. Task 4.

---

### Task 1: The `galleryItem` kind (server)

**Files:** create `src/server/magazines/items/galleryItem/{block.ts,kind.ts,picker.ts,featurable.ts}` (+ tests), `src/migrations/20261114b_magazine_gallery_items.ts`; modify `items/registry.ts`, `items/blocks.ts`, `items/pickers.ts`, `src/lib/magazines/item-views.ts` (view + `UnavailableItem.reason` gains `withdrawn`), `src/lib/magazines/picker.ts` (`PICKABLE_ITEM_KINDS`; `PickerSourceCandidate.thumbnailUrl?: string`), `src/lib/magazines/references.ts` (`galleryItemInputReference`), `src/server/db/payload-schema-drift.ts`, `src/migrations/index.ts`, `src/payload-types.ts`, `src/collections/magazines-schema.test.ts` and the registry tests.

**Interfaces:**
- `featurable.ts`: `featurableWhere(communityId): Where` (ready, not hidden, `magazineConsent`, uploader ≠ `DELETED_AUTHOR_ID`, same community) and `isFeaturable(item, communityId): boolean` — one predicate for picker, `acceptNew`, suggester.
- View `GalleryItemItemView = { kind: "galleryItem"; itemId; galleryItemId; mediaType; url; thumbnailUrl; width; height; durationSeconds; caption; alt; label /* {text}|{key,values} from galleryItemLabel */; event: {title; slug} | null; uploader: { name } /* "Deleted member" key for DELETED_AUTHOR_ID */; href /* /communities/{slug}/gallery?item={id} */; membersOnly: boolean; intro; image: null }`.
- Strategy: `validate` → `acceptNew` = `isFeaturable` + readable by the **editor's** gallery viewer; refuses a non-null `image` (`ITEM_INVALID`, detail "gallery items can't carry their own image"). `load` → one `payload.find` for the ids; reader viewer via `loadGalleryViewerById(deps, { communityId: ctx.community.id, userId: reader })` (one query per issue); per item: gone → `missing`; not ready → `not_ready`; hidden or consent withdrawn → `withdrawn`; not readable by `galleryReadableWhere(viewer)` semantics → `no_access`; else the view with URLs via `itemFileUrls` (object storage from `getObjectStorage`; widen magazine deps minimally if needed) and `membersOnly = visibility === "community"` (editor access only; readers get false). `isReadable` → true (filtering happens in `load`, as other kinds).
- Picker: `search(query, ctx, exclude)` over `featurableWhere` ∧ readable by the editor ∧ not excluded, matching caption/alt/event title; candidates carry `title` (translated label server-side with `getTranslations`), facts (event, date, media type), `thumbnailUrl` (signed after the check), `openHref`.

- [ ] Steps: failing tests for each rule incl. Review Focus 1, 2, 3, 4 → implement → `pnpm vitest run src/server/magazines src/lib/magazines src/collections src/server/gallery` + typecheck → commit `feat(gallery): feature gallery items in magazine issues`.

### Task 2: Auto-draft suggester

**Files:** create `items/galleryItem/suggest.ts` (+ test); modify `items/suggesters.ts`, `src/lib/magazines/auto-draft.ts` (`AUTO_DRAFT_SOURCE_IDS`/`AUTO_DRAFT_SOURCES`: `galleryItems`, after events, `defaults.enabled: true`, `countsTowardMinimum: false`), `src/lib/magazines/suggestions.ts` (`galleryHighlight` reason `{ eventTitle, count }`), `src/components/magazines/editor/suggestion-reason.tsx`, messages (`magazineEditor.autoDraft.sources.galleryItems`, `.sourceHelp.galleryItems`, `magazineEditor.builder.reasons.galleryHighlight`), `docs/adr/0047-…md` (add the source to D1 — living doc), and the pinned tests (`auto-draft.test.ts`, `suggesters.test.ts`, settings form test, drafter integration fixtures).

**Rule:** events that ended in the window (`endedCommunityEvents`), ranked by count of featurable items readable by the editor, then later end, then id; per event the newest featurable item (tie → id); at most `config.limit`; never in `config.exclude`; deterministic. No URLs in reasons.

- [ ] Steps: failing tests (ranking, one per event, exclude, determinism, consent/hidden/deleted-uploader excluded, minimum not counted) → implement → `pnpm vitest run src/server/magazines src/lib/magazines src/components/magazines` → commit `feat(gallery): suggest event highlights in magazine auto-drafts`.

### Task 3: Renderer, builder, picker UI

**Files:** create `src/components/magazines/items/gallery-item.tsx` (+ test); modify `items/registry.tsx` (`ITEM_RENDERERS`, `ITEM_TITLES`), `editor/builder/items/registry.tsx` (`BUILDER_ITEM_KINDS`, `ADD_TAB_ORDER` — after events; no image editor for this kind; never wire "Use source image"), `editor/builder/picker-panel.tsx` (thumbnail when `thumbnailUrl`), unavailable-reason copy for `withdrawn`, messages, fixtures.

Behaviour: all four sizes (`lead` large figure + caption + credit + event link; `card`; `row` via `ItemRow` with a thumbnail; `related` compact). Video: thumbnail + play badge (icon + "Video" text) linking to `href`; no inline playback. Credit line "Photo by {name}" / "Video by {name}" (Sans), event link; `membersOnly` marker for editors. Alt text from `alt`, else the label. Lazy images keep working when the signed URL refreshes on re-render (no caching of view URLs in stored state).

- [ ] Steps: failing tests (four sizes, video badge, credit for deleted member, members-only marker, picker thumbnails, builder has no image editor for gallery items, unavailable `withdrawn` copy) → implement → `pnpm vitest run src/components/magazines src/i18n` → commit `feat(gallery): render featured gallery items in issues`.

### Task 4: Remove the rollout flag; agent tools

**Files:** every reference in the list below; `src/app/api/mcp/community-tools.ts:63` (add `gallery` to the space types); `src/server/api/routers/agent-magazines.ts` (refuse `galleryItem` in agent issue saves with a clear error; `magazine-tools.ts` union unchanged).

Remove: `src/server/gallery/flag.ts`; `src/env.js` entries; `.env.example` lines; `gallery/page.tsx` gate; cron route gallery-disabled skips; checks in `uploads.ts`, `event-section.ts`, `feed-view.ts`, `routers/gallery.ts`; `SURFACE_FLAGS`/`hiddenBuiltinSurfaces` in `space-visibility.ts` and `ROLLOUT_GATED_SURFACES`/`FALLBACK_NAV_SURFACES` gating in `space-defaults.ts` (keep the seam only if another surface still needs it — none does: delete it); error code `GALLERY_DISABLED` (`gallery-rules.ts`, `errors.ts`, `gallery-upload-refusals.ts`); and all tests/`stubEnv` lines listed in the recon. `grep -rn "galleryEnabled\|COMMUNITY_GALLERY_ENABLED\|GALLERY_DISABLED\|ROLLOUT_GATED" src` must return nothing.

- [ ] Steps: update tests first (Gallery tab always listed; no gate) → remove → full `pnpm vitest run` (baseline only) + typecheck → commit `feat(gallery): launch the gallery for every community`.

### Task 5: Verification (controller)

Full suite; `pnpm check`; DB tests (apply `20261114b` to `aitcom_test`); migration + `db-verify-payload-schema` on `dev-verify`; production build (6 GB heap); browser check: picker with thumbnails, an issue with a photo and a video, a withdrawn item for an editor.
