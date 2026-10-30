# Magazine active reading time

Status: active reading-time tracking approved by Greg on 2026-10-30 in response to the tracking scope question. Actual openings are the requested meaning of impressions. The following details implement that approved scope.

## Definition and approach

Extend the existing silent reading tracker on readable issue and article pages, including previews, excluding editor visits. Count elapsed seconds only while the document is visible, the window has focus and interaction occurred within the preceding 60 seconds. Initial entry and regained focus start an active window. Scroll, pointer and keyboard activity renew it. Pause immediately on hide or blur. Never count a long suspended timer interval as reading. This is an estimate of active reading, not proof of attention.

Use cumulative first-party page-session tallies. Compared with an external analytics service this keeps reporting in our own Insights and access resolver; compared with storing every heartbeat it avoids an append-only event stream and makes retries idempotent. Generate one random UUID in memory per page tracker; no cookie or browser storage and no account, reader key, IP or user-agent stored in these duration rows. Different pages/tabs are separate sessions; this does not measure a person's unique wall-clock time across tabs/devices.

Report a cumulative integer number of seconds every 15 seconds, with a best-effort final keepalive request on hide, blur, pagehide or component cleanup. Retry failures through the next cumulative report. Keep the same session across effect restarts and never add totals from retry requests. Cap a page session at two active hours. A new server session accepts at most 15 seconds initially; later updates cannot exceed elapsed server wall time plus that initial allowance, and use GREATEST to retain larger existing reports. Bind a UUID to its original magazine/issue/article; a reused token cannot change page identity.

## Recording and access

Add `app.magazine_reading_session` with UUID primary key, magazine/issue/optional article IDs, active seconds, first/last server timestamps and a magazine index. Add Payload foreign keys with cascade deletes in an additive idempotent migration. Do not execute migrations or touch a database in this session.

A same-origin JSON POST endpoint validates positive page IDs, UUID and 0–7200 integer seconds, uses the existing per-instance IP rate limiter, resolves the optional authenticated viewer and rechecks issue access/article placement through the same helper as opening tallies. Unreadable pages and editor previews record nothing. Failures stay silent in the reader. No CORS access is granted. The endpoint rejects explicit cross-origin requests.

## Reporting

The owner/admin community Insights summary and each published issue row gain active seconds and measured page-session count. Aggregate only positive-duration rows joined to currently published issues of this magazine and community. Total active time includes issue and article pages. Average time is total seconds divided by measured page sessions, never historical opening counts and never a sum of issue averages. Existing all-time totals remain independent of the 7/30/90 selector.

Show total active reading time and average per measured page session, with localized minute/hour units and a short explanation of forward-only coverage and the idle rule. Show an em dash with no measured sessions; do not imply historic zero time. Include the measured session count and distinguish it from unique readers. Extend the existing issue performance table with average reading time; its detail screen remains unchanged.

## Verification

Use fake timers and mocked requests to verify focus/visibility/idle pauses, activity resume, suspension, cumulative retry and cleanup behavior, disabled trackers and Strict Mode. Mock server access and writes to prove authorization, article placement, validation, rate limiting, cumulative upsert and token/page binding. Compile aggregate SQL to verify publication/community scope, positive-session denominator and full-summary totals independent of pagination. Run only new/touched tests, workspace typecheck, targeted lint/format and independent review. No full suite, integration/Chromium tiers, database writes or push.

## Delivery evidence

Implemented the timer, guarded endpoint, cumulative upsert, additive migration and Insights duration totals/averages. All 51 tests across eight added/touched unit-test files pass. The tests exposed and verified a correction preventing timer reactivation between `pagehide` and `pageshow`. Workspace typecheck and targeted ESLint pass. Independent review approved the extension with no findings. Test requests, access checks and writes use mocks; the migration was not applied. No database or deployment was touched.

After implementation, Greg explicitly requested the migration. Applied `20261030a_magazine_reading_time` to the database configured in `.env` on 2026-10-30, recorded as batch 148. Read-only verification confirmed all seven columns, three cascading foreign keys, primary key, bounded seconds check, magazine index and migration record. No application deployment was performed in that step.
