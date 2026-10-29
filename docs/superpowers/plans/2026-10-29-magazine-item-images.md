# Magazine Item Images Implementation Plan

**Goal:** Let issue editors add and compose optional images on any issue item.

**Architecture:** Put issue-owned image metadata at the shared item boundaries, keeping the seven content strategies focused on source content. A shared figure renders the same image configuration in editor controls, live preview and reading layouts.

**Tech stack:** React, native select/range controls, next-intl, Zod, Payload JSON fields, registered PostgreSQL migration, Vitest.

- [x] Define `src/lib/magazines/item-image.ts`: image schema, shape ratios, safe stored parsing and default image composition.
- [x] Add the shared image field/input and registry serialization/enrichment in `src/server/magazines/items/{base-fields,base-input,registry}.ts`; extend client view metadata without changing access decisions.
- [x] Add `20261029b_magazine_item_images.ts` for the seven block tables, register it, and generate only the relevant Payload type additions with an unreachable database and push disabled.
- [x] Add a shared figure and connect it through `src/components/magazines/items/registry.tsx`, suppressing duplicate article source imagery.
- [x] Add `item-image-editor.tsx` to the shared item details panel, using the existing image upload field, source image reuse, shape selection, focal ranges and caption/credit/alt fields.
- [x] Overlay working image metadata in the builder preview and guard publishing/unsaved work during uploads in `issue-builder.tsx`.
- [x] Translate all controls and hints in EN/NL/FR and update scoped publication styles/documentation.
- [x] Run only added/touched focused tests and `pnpm typecheck`; review the final diff and commit locally; apply the migration and publish only when explicitly authorized.

## Verification

- 165 focused unit tests passed across the nine added or touched test files. Tests cover all seven item kinds, API/storage round trips, unreadable-item filtering, source-image replacement, crop/caption/credit/alt controls, upload failures, autosaving uploads, and closing/reopening an uploader.
- Workspace `pnpm typecheck`, targeted ESLint, Prettier checks and `git diff --check` passed.
- Standards and spec reviews identified an upload-remount race. A deferred-upload test reproduced it; parent-owned busy state now disables every image mutation across remounts and the regression passes. Both reviewers found no remaining material issues after the correction.
- The design detector reported no findings on the changed image controls/renderers. No new detector suppressions were added.
- Browser visual verification could not be completed: the browser access host was unavailable. Temporary isolated preview files/server were removed; no visual pass is claimed.
- Migration `20261029b_magazine_item_images` is registered but was not applied. No database writes, uploads to real services, integration tiers, full test lanes or pushes were performed for this change. Apply the migration before deploying this schema-dependent feature to a preview.

## Authorized publication

Greg subsequently requested the migration, PR and merge. The preview environment dry run showed only `20261029b_magazine_item_images` pending. Applied and recorded it as batch 141, then verified all seven item tables have a nullable `image` JSONB column and the migration ledger contains the expected entry. No other migrations ran.
