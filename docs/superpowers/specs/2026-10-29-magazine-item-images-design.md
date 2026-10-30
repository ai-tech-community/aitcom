# Issue item images

Greg approved the first image-editing slice: optional images for individual issue items, focal-point/crop controls, captions, credits and alt text. Keep the existing magazine shell and editor design system.

Each item kind gains an optional `image` JSON object owned by its issue block. It contains a validated image URL, alt text, caption, credit, crop shape (landscape, portrait or square), and horizontal/vertical focal percentages. Existing items remain unchanged. Editors can upload through the existing shared image service or reuse the current article image when available. Removing a custom image restores the original item's presentation.

The common item details panel edits this metadata. The existing autosave queue saves it with the item; unsaved metadata updates the live preview immediately. Upload progress blocks publishing and participates in the unsaved-work guard. No source article or linked content is edited.

The common reader adds a semantic image figure before the item renderer. A custom article image replaces its existing lead image instead of duplicating it. Compact rows use a thumbnail layout; other item sizes honor the chosen crop. Preview readers may see issue-owned imagery for readable items; unavailable or unreadable source items never disclose images or captions. Existing article teaser/body rules remain in force.

Add nullable image JSON columns to all seven Payload item block tables in an idempotent migration. Apply the migration before deploying the schema-dependent feature to a preview or production.

Maintain English, Dutch and French copy. Verify common input/storage round trips, reader filtering and rendering, live preview changes, image controls/upload failure, and the builder upload/publish boundary with focused unit files plus workspace type-check. No full suites, integration tiers or real test databases.
