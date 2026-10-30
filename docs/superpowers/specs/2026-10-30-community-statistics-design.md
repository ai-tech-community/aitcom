# Community statistics dashboard

Status: approved by Greg on 2026-10-30. Growth and participation are the confirmed priority.

## Goal and approach

Help a community owner or administrator answer: how many members do we have, are people participating, how is recorded participation changing, and where does it happen?

Extend the existing `/communities/[slug]/insights` page. Preserve its activation funnel and member follow-up tools, and add a statistical overview above them in the established AIT visual system.

Alternatives considered:

1. **Extend Insights (recommended).** Reuse the existing route, community authorization and contribution vocabulary. Owners can move from evidence to existing follow-up tools on one page.
2. **Create a separate Statistics route.** More room for reporting, but duplicates navigation and separates trends from action. Unnecessary for the first release.
3. **Introduce a reporting warehouse and historical rollups.** Supports larger analytics later, but needs migrations, ongoing writes and a proven performance need. Outside this read-only first release.

## Metric contract

- **Current members:** current `community_membership` rows with `status = active`. This is a live snapshot, separately labeled from period metrics. Pending approvals and invitations are shown as separate current counts. Banned rows do not count as members.
- **Member contributors:** distinct `actorId` values on qualifying community-scoped contribution events with `actorType = member` during the period. This includes people who contributed and subsequently left; it is not a count of logins, visitors or currently enrolled members. Attribution is what the event records: scheduled ritual posts can be attributed to their member author, so this does not prove manual human activity.
- **Member contributions:** qualifying events with `actorType = member`. Reuse `CONTRIBUTION_ACTIONS`; explain that participation includes votes, event registrations and challenge actions as well as publishing and replies. Exclude commissioned work and system activity.
- **Agent contributions:** qualifying events with `actorType = agent`, displayed separately. Agents must never inflate the member contributor count.
- **Recorded joins and voluntary leaves:** count scoped `community.joined` and `community.left` events. They are transitions, not unique people; rejoining may count again. These counts do not reconstruct historical membership totals and do not include bans/removals as voluntary leaves. An agent can act for a human join, so join counts do not filter to member actors.
- **Returning contributors:** member contributors present in both the selected period and its immediately preceding period. Label as returning contributors, never member retention or churn.
- **Activity by area:** group the same qualifying actions into Feed, Forum, Ideas, Projects, Events and Challenges. Display member and agent counts separately and keep the taxonomy centralized so totals reconcile.

Presets: 7, 30 and 90 days; default 30. Use complete UTC calendar days, ending at today's 00:00 UTC, for the selected period and an equally long preceding period. Show actual date ranges and the UTC convention. Live membership counts use the response's generation time. UTC buckets avoid dependence on the server timezone and daylight-saving changes. Do not mix daily distinct counts with period distinct totals.

Comparisons use absolute changes and a percentage only when the previous value is nonzero. When it is zero, display a localized “No prior activity” label instead of infinity. Do not attach fabricated historical comparisons to the current membership snapshot.

## Layout and behavior

Use the existing community page frame, typography, neutral surfaces, chart tokens and shared primitives. This is an extension of the existing Insights surface, not a new visual identity.

1. A clear page heading and explanation, followed by the period selector and exact comparison dates.
2. A compact ruled overview of current members, member contributors, member contributions and recorded joins. Supporting labels disclose scope and comparisons.
3. A wide daily participation chart separating member and agent contributions. Beside or below it, a recorded joins/leaves trend. Both have a keyboard-accessible tabular data alternative and zero-filled dates.
4. Activity-by-area bars with numeric labels, plus returning contributor and agent totals and current pending/invited membership counts.
5. A short data-definitions disclosure stating that figures reflect recorded community activity; missing or unscoped historical events are unavailable. Recorded growth is not a historical member balance.
6. The existing activation funnel and follow-up lists, with their own 30-day and 14-day windows stated explicitly. The main period selector does not silently change their definitions.

Use the existing Skeleton, EmptyState and ErrorState components. Failed statistics have a retry action and never appear as zero activity. A community with members but no recorded activity still shows membership totals and an honest explanation. A community with no members has a useful empty state linking to its existing member-management screen. Charts have text labels and legends and do not rely on color alone. Disable unnecessary chart animation and support narrow containers without horizontal page overflow.

Localize all new interface text and number/date formatting in English, Dutch and French, matching the actual locale configuration.

## Architecture and access

- Add an owner/admin-only query to the existing insights tRPC router. Resolve the community through `communityProcedure`, then enforce active owner/admin access before any statistics queries. Inactive roles, moderators, ordinary members and outsiders cannot call the new endpoint.
- Keep moderators' existing operational Insights view available. Render the new statistical overview only for owners/admins; retain existing server gates on operational endpoints.
- Keep calculations and period definitions in a pure statistics module, independent of database and UI code. Keep source queries in a focused read module. Scope every query to the resolved community ID, never an arbitrary client-supplied ID.
- Aggregate events in PostgreSQL by day, actor type and action, using count and distinct contributor sets as needed; do not ship raw event histories or personal identifiers to the client. Bound the scan to the selected and previous periods (maximum 180 days). Query current memberships by status using existing indexes. Do not cap events silently or derive unique contributors by summing daily distinct counts.
- Use only existing tables, existing indexes and read queries. No schema migration, backfill, scheduled collector or database write is required. Do not start a live development or build path that may run migrations or seed data.

## Data limitations

Source review verifies fields and instrumentation, not production row counts or historical completeness. Community attribution is optional in the event schema, and not every content path emits the shared contribution events. Historical unscoped activity cannot be reliably reassigned by this dashboard. Membership `joinedAt` can predate acceptance and must not substitute for a recorded join timestamp. Event logging can occur after a successful state change, so recorded activity is not an accounting ledger.

Event registrations and publishing records support more detailed future reporting, but registration is not attendance and reading is not completion. Detailed event, magazine, room-chat and course analytics are deferred from this growth-and-participation release. The report in `docs/research/2026-10-30-community-analytics-data.md` records the supporting sources and caveats.

## Verification

Run only the new or touched unit-test files and the workspace `pnpm typecheck`. Cover UTC boundaries (including daylight-saving dates), empty and zero-baseline comparisons, deduplication across days, distinct member/agent identities, action-category reconciliation, omitted/unscoped events, current membership statuses, returning-contributor intersection and authorization before database reads. Mock database calls; never use a real database. Cover selector changes, error/retry, empty states and the existing moderator view. Verify locale-key parity and perform bounded desktop/mobile rendering with synthetic fixtures if a live app cannot be rendered without writes. Do not run full suites, integration or Chromium test tiers, build scripts with database effects, migrations or pushes.

## Work checklist

- [x] Explore existing route, metric logic, membership lifecycle, authorization and visual system.
- [x] Confirm the priority: growth and participation.
- [x] Compare implementation approaches and prepare a concrete design for review.
- [x] Complete source-cited data research and self-review the design against it.
- [x] Obtain Greg's approval of this design before application implementation.
- [x] Write the implementation plan, build the dashboard and run the permitted checks.

## Implementation and verification

Implemented on 2026-10-30 at the existing localized `/communities/[slug]/insights` route. Owners and admins see the new 7/30/90-day overview. Moderators retain the existing health pulse and follow-up panels. The existing page entry needed no change.

`statistics.ts` owns UTC periods, exhaustive action-to-area mapping, comparisons, zero-filled series and the response type. `statistics-queries.ts` performs three scoped aggregate reads: membership status counts, day/action/actor counts and distinct member-contributor intersections. The new `insights.statistics` query validates the selected preset and rejects non-owner/admin roles before aggregate reads. No raw actor identifiers are returned.

The UI uses shared controls and data states, separate member/agent series, native daily-data tables, numeric area totals and expandable definitions in English, Dutch and French. Membership-loading failures now show retryable errors in both the enclosing layout and dashboard instead of becoming access denial or an operational-view fallback. Zero-baseline comparisons retain the absolute change without an infinite percentage.

Verification:

- All **44 tests in six new unit-test files passed**: pure metric/UTC cases (9), compiled SQL read-contract cases (2), actual middleware/router authorization with mocked data (11), statistics view/controller (10), owner/admin/moderator composition (6), and enclosing access layout (6).
- Workspace `pnpm typecheck`, targeted ESLint and `git diff --check` passed. The changed UI was scanned by the design detector with no deterministic findings.
- Native Chrome rendered the real statistical React components with synthetic aggregate inputs at desktop and a 400px phone viewport, including Dutch copy and dark mode. Phone controls, legends, charts and localized labels fit their containers. A bounded correction pass addressed initial chart-dimension warnings, chart alignment and wrapped metric-label alignment. These previews verify rendering, not production data.
- An independent code reviewer approved the feature after its two minor findings (absolute zero-baseline changes and retryable membership errors) were resolved.

No database was queried or written, no migrations or backfills were run, and nothing was pushed or deployed. Live historical coverage, query latency against production volume and end-to-end live data remain unverified. Existing activity instrumentation limitations remain visible in the dashboard's definitions; the feature does not claim complete membership history, churn, attendance or universal engagement.
