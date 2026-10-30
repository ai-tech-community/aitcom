# Magazine statistics in community Insights

Status: approved by Greg on 2026-10-30.

## Purpose and approach

Extend the existing owner/admin community Insights dashboard with a Magazine performance section. Help organizers understand what they have published, how it is being read, and whether readers subscribe or join the community.

Recommended: a compact overview and published-issue table inside Insights, with links to existing issue statistics. A separate analytics page would add another destination for information owners should see together. New daily readership telemetry would support richer trends later, but existing lifetime tallies are enough for this first release and need no data migrations or collector changes.

The existing visual system, community navigation and operational follow-up panels remain the authority. Place the new section after growth/participation statistics and before member follow-up. This is an extension, not a visual redesign.

## Data contract

Each community has at most one magazine. Resolve it by the authenticated community ID, and restrict published issue aggregates to both that magazine and that community. Include published issues of every readership visibility in this owner/admin view. Draft and scheduled issues are not readership-performance rows.

Summary values:

- **Published issues:** all currently published issues belonging to this community's magazine.
- **Issue views:** sum the stored view counters for issue-page records (`articleId IS NULL`) of those issues. Do not add article-page views to issue views.
- **Recorded readers:** distinct stored reader keys across all pages of those published issues. Deduplicate across issues and articles; never sum per-issue distinct counts. Signed-in keys are stable, while signed-out keys rotate daily and may be shared, so this is not an exact number of people.
- **Current confirmed subscribers:** existing subscription records with `confirmedAt` set for the magazine, including account and email subscribers. Exclude pending email confirmations. This is a current snapshot, not lifetime subscription acquisitions or email reach.

A supporting **Community joins attributed to the magazine** count uses existing verified magazine-source metadata and the existing issue-statistics attribution definition, deduplicated at magazine level. Include only sources attached to this magazine's published issues and this community. Explain that attribution records a join source, not causal uplift or a conversion rate.

The issue table shows issue number/title, publication date, issue-page views, distinct recorded readers, current confirmed subscriptions attributed to that issue, and attributed joins. Sort newest publication first with a deterministic issue-ID tie-breaker; show ten rows per page. Summary aggregates cover every eligible published issue regardless of the table page. Link each row to its existing issue-statistics screen, which already has article readers and read-to-end counts. Do not duplicate the article-level analytics UI in Insights.

All readership and attribution counters are **All time**; subscribers are labeled **Current**. All time means the available recorded history, not guaranteed coverage since the magazine was created. The community dashboard's 7/30/90-day selector does not apply to this section. Stored view tallies have first/last timestamps rather than a complete event history, so filtering them by last-seen time would misrepresent historical views. Existing subscription records can be deleted on unsubscribe, so attributed subscription counts describe subscriptions that remain confirmed today.

Source evidence: `src/server/magazines/stats/issue-stats.ts`, `src/server/magazines/stats/reader-key.ts`, `src/server/magazines/stats/reads.ts`, `src/server/magazines/subscriptions/service.ts`, `src/server/db/schema.ts` (magazine reads/subscriptions), and the magazine/issue collections.

## Implementation boundaries

- A separate magazine-statistics query on the Insights router enforces active owner/admin access before any magazine reads. Moderators retain their existing Insights view; delegated editors keep access through existing magazine-editor routes.
- Use a focused magazine analytics read module with batched SQL aggregates and a bounded metadata query for the table page. Avoid calling the complete issue-statistics loader once per table row. Return aggregate numbers and issue metadata only; no subscriber emails, user IDs or reader keys leave the server.
- Reuse the existing source-attribution helpers and issue-statistics semantics. Keep magazine lookup read-only; do not initialize a magazine when none exists.
- Keep loading, error/retry and empty states independent of community statistics. No magazine shows an owner/admin action linking to existing magazine management. A magazine with no published issues explains that publishing an issue enables the performance table; current confirmed subscriber counts still remain visible. Missing readership is shown honestly as recorded zeros, not invented estimates.
- Support English, Dutch and French, localized numbers/dates, keyboard-accessible issue links and pagination, narrow containers, and the existing dark theme.
- No database writes, migrations, tracking changes, emails, deployment or push are part of this implementation step.

## Verification

Run only new/touched unit-test files and workspace `pnpm typecheck`, plus targeted lint/format checks. Test owner/admin authorization before reads, community/magazine scoping, published-only issues, cross-issue reader deduplication, issue-versus-article view separation, confirmed/pending subscriptions, shared attribution semantics, all-time labels, paging without partial summary totals, no-magazine/no-issues states, fetch errors and locale keys. Use mocks and synthetic fixtures only; no real database or integration/Chromium/full-suite tests.

## Work checklist

- [x] Inspect current dashboard and existing magazine statistics/read/subscription sources.
- [x] Compare approaches and define the recommended integrated section.
- [x] Self-review metric definitions, scope, privacy and period limitations.
- [x] Greg approves the written design.
- [ ] Write implementation plan, implement and run permitted checks.
