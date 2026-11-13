# Community Gallery — Slice 3 (Reports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone who can see a gallery item can report it — including "This is me, please remove it" — the first report hides it, moderators are told once and review it in the lightbox (Restore or Remove), and the uploader is told about "this is me" reports.

**Architecture:** Feed-post reports already exist (`post-reports`). The rules both targets share — open-report filter, duplicate detection, recount, restore patch, moderator recipients — move into one server module that `post-reports.ts` and the new `src/server/gallery/reports.ts` both use (feed behaviour unchanged). Gallery reports get their own collection (`gallery-reports`) with a reason enum that adds `this_is_me`. The first report hides the item through one guarded SQL write, so "notify moderators once per hide" is atomic. A moderator's Remove goes through the same removal path as Delete.

**Tech Stack:** Next.js, Payload CMS 3 (Postgres), tRPC, Drizzle, next-intl (en/nl/fr), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-community-gallery-design.md` — section "Reports and moderation" incl. the "Settled 13 Nov (slice 3)" bullets.

## Global Constraints

- Branch `feat/community-gallery-reports` (stacked on slice 2, PR #570). Never `git checkout`/`switch`/`stash`/`add -A`/`add .`; check `git branch --show-current` before every commit.
- Never run `pnpm dev`, `pnpm build`, `db:apply*`, `payload migrate`, or anything reading `.env` (production). DB tests gated on `RUN_DB_TESTS=1`; the controller runs them.
- Migration for this slice: `20261113c_gallery_reports`, additive only, registered in `src/migrations/index.ts`; regenerate `src/payload-types.ts`.
- `GALLERY_REPORT_REASONS = [...REPORT_REASONS, "this_is_me"] as const`. `REPORT_REASONS`, the feed's zod enum and `enum_post_reports_reason` stay unchanged.
- Feed post report behaviour must not change (its tests stay green, unchanged except imports).
- Notification types: `gallery_item_reported` (moderators) and `gallery_item_this_is_me` (uploader). Both set `metadata: { itemId, reviewPath: "/communities/{slug}/gallery?item={id}", linkLabel }`. Title/content in English like other notifiers (no per-locale notification text exists).
- Reporter identities never reach the client; `reportCount` stays server-side.
- New procedures use the gallery router's flag-gated procedure builders.
- Copy en/nl/fr; DESIGN.md binds the UI. No AI credit lines in commits.

## Review Focus

1. **A report reveals or hides the wrong thing** — reporting an item the reporter can't read (hidden, community-only for an outsider, another community) must be NOT_FOUND; a hidden item stays readable by moderators and its uploader only. Tests in Task 2.
2. **Two first reports at once** notify moderators once. Test in Task 2 (DB).
3. **Remove leaves an empty feed post or orphaned reports** — Remove of the last ready item of a caption-less batch releases the post; reports go with the item. Tests in Task 2 (DB).
4. **Feed reports change behaviour** after the shared-rules extraction. Existing feed report tests unchanged and green (Task 1).
5. **"This is me" on your own photo / by a deleted uploader** — uploader self-report refused; uploader notification skipped for `DELETED_AUTHOR_ID`. Tests in Task 2.

---

### Task 1: Shared report rules, gallery reports collection, migration

**Files:**
- Create: `src/server/moderation/report-rules.ts` (+ test) — the shared rules
- Modify: `src/server/communities/post-reports.ts` and `src/server/api/routers/feed.ts` (use the shared rules and the shared moderator query; no behaviour change)
- Create: `src/lib/gallery-report-reasons.ts` (+ test), `src/collections/GalleryReports.ts` (+ schema test); Modify `src/payload.config.ts`
- Create: `src/migrations/20261113c_gallery_reports.ts`; Modify `src/migrations/index.ts`; regenerate `src/payload-types.ts`

**Interfaces:**
- Produces (`report-rules.ts`): `openReportsWhere(field: string, id: number): Where`; `isDuplicateReportError(error: unknown, collection: string): boolean`; `RESTORE_PATCH = { hiddenAt: null, reportCount: 0 }`; `countOpenReports(payload, collection, field, id): Promise<number>`; `communityModeratorIds(db, communityId): Promise<string[]>` (active owner/admin/moderator — exactly the query `notifyPostReported` uses today, which then calls it).
- Produces: `GALLERY_REPORT_REASONS`, `type GalleryReportReason`, `GALLERY_REPORT_REASON_LABELS` (English admin labels).
- Produces: collection `gallery-reports` — `item` (relationship → `gallery-items`, required, index), `reporterId` (text, required, index), `reason` (select from `GALLERY_REPORT_REASONS`), `note` (text, max 500), `dismissedAt` (date, index, read-only), timestamps, unique `(item, reporterId)`, access admins-only (like the gallery collections).
- Migration: enum `enum_gallery_reports_reason` with all six values, table, `item_id` FK `ON DELETE CASCADE`, unique index, indexes, `payload_locked_documents_rels.gallery_reports_id` (+ FK + index), following `20261113a_community_gallery.ts`.

- [ ] Step 1: failing tests for the rules (pure), reasons list (superset, feed list untouched), schema. Step 2: run → FAIL. Step 3: implement; refactor post-reports/feed to the shared rules. Step 4: `pnpm vitest run src/server/moderation src/server/communities src/server/api/routers/feed src/lib src/collections` + typecheck → PASS; existing feed report tests unchanged. Step 5: commit `feat(gallery): add gallery reports and share the report rules`.

### Task 2: Report service, review, notifications, router

**Files:**
- Create: `src/server/gallery/reports.ts` (+ test, + gated `reports.integration.test.ts`), `src/server/gallery/notifications.ts` (+ test)
- Modify: `src/server/gallery/items.ts` (extract the removal path shared by `deleteItem` and review Remove; add `hidden` to `GalleryItemView`), `src/server/api/routers/gallery.ts` (+ test)

**Interfaces:**
- Produces (`reports.ts`, deps = `GalleryDeps` + `notify` functions injected):
  - `reportItem(deps, { viewer, itemId, reason: GalleryReportReason, note? }): Promise<{ hidden: true }>` — item must be readable by `galleryReadableWhere(viewer)` and ready, else NOT_FOUND; signed-in only; uploader → BAD_REQUEST (`OWN_ITEM`-style stable code); existing report by this reporter (incl. dismissed) → CONFLICT; create; recount open reports; **atomic hide**: `UPDATE gallery_items SET hidden_at = now WHERE id = $1 AND hidden_at IS NULL RETURNING id` (via the Payload adapter's drizzle, `sql.identifier`) — the winner notifies moderators (`gallery_item_reported`); then write `reportCount`. If `reason === "this_is_me"` and the uploader isn't `DELETED_AUTHOR_ID`, notify the uploader (`gallery_item_this_is_me`) on every such report. Notification failures are logged, never fail the report.
  - `listItemReports(deps, { viewer, itemId }): Promise<{ reason; note: string | null; createdAt: string }[]>` — moderators only (FORBIDDEN); open reports newest first; no reporter ids.
  - `reviewItemReports(deps, { viewer, itemId, action: "restore" | "remove" })` — moderators only; item gone → delete its reports, NOT_FOUND; `restore` → dismiss open reports + `RESTORE_PATCH`; `remove` → the shared removal path (row, files via `removeItemFiles`, `releaseEmptyGalleryPost`), reports cascade.
- Produces (`notifications.ts`): `notifyGalleryItemReported(db, { communityId, itemId })`, `notifyUploaderThisIsMe(db, { communityId, itemId, uploaderId })` — insert into `notifications` with the types/metadata in Global Constraints; recipients from `communityModeratorIds`.
- `GalleryItemView.hidden: boolean`.
- Router: `reportItem`, `itemReports`, `reviewItemReports` on the flag-gated protected builder; zod `reason: z.enum(GALLERY_REPORT_REASONS)`, `note` ≤ 500.

- [ ] Step 1: failing tests for every rule above incl. Review Focus 1, 3, 5 (unit) and 2, 3 (DB). Step 2: run → FAIL. Step 3: implement. Step 4: `pnpm vitest run src/server/gallery src/server/api/routers/gallery.test.ts` → PASS. Step 5: commit `feat(gallery): report, hide and review gallery items`.

### Task 3: Report and review UI

**Files:**
- Create: `src/components/moderation/report-form.tsx` (+ test) — the presentational form (reason radios, note, submit) extracted from `src/components/communities/feed/report-dialog.tsx`, which then uses it (feed behaviour/tests unchanged)
- Create: `src/components/communities/gallery/gallery-report-dialog.tsx`, `gallery-review-banner.tsx` (+ tests)
- Modify: `gallery-lightbox.tsx` (+ test), `gallery-tile.tsx` (hidden badge), `use-gallery-lightbox-host.tsx` and `gallery-page.tsx` (refresh after report/review), `messages/{en,nl,fr}.json`

Behaviour:
- Lightbox side panel: **Report** (ghost) for signed-in viewers who aren't the uploader, on items that aren't hidden. Dialog lists the gallery reasons with "This is me, please remove it" first, note ≤ 500; success line `role="status"`; CONFLICT → "You already reported this".
- Hidden item, seen by a moderator: a banner "Hidden after a report" with the open reasons and notes (`itemReports`), **Restore** (outline) and **Remove** (destructive, confirm). Seen by the uploader: "Hidden while a moderator reviews it."
- Tiles of hidden items (moderators/uploader only) carry a small "Hidden" badge (text, not colour only).
- After report/review: invalidate `gallery.list`, `gallery.facets`, `gallery.item`, and call the host's `onChange` (feed/event refresh).
- Copy en/nl/fr incl. reason labels under a gallery namespace; reuse the feed's reason labels where identical.

- [ ] Step 1: failing tests (visibility of Report per viewer; dialog reasons + submit input; CONFLICT copy; moderator banner restore/remove calls; uploader banner text; badge; invalidations; feed report dialog tests still green). Step 2: run → FAIL. Step 3: implement. Step 4: `pnpm vitest run src/components/communities src/components/moderation src/i18n` → PASS. Step 5: commit `feat(gallery): report and review gallery items in the lightbox`.

### Task 4: Verification (controller)

- Full suite vs baseline; `pnpm check`; DB tests on `aitcom_test` (apply `20261113c`); migration on `dev-verify` (fresh reset if needed); `db-verify-payload-schema` on dev-verify; production `next build`; browser check of the report dialog and the moderator banner.
