# Authorization Analysis Report
## AIT Community (aitcommunity.org)

## 1. Executive Summary

- **Analysis Status:** Complete
- **Key Outcome:** Nine authorization vulnerabilities were identified and systematically validated against source code across the tRPC gateway (260+ procedures), direct HTTP API routes, and the PayloadCMS REST layer. Five vulnerabilities carry high confidence; two carry medium confidence; two carry low confidence. All high- and medium-confidence findings have been passed to the exploitation phase via the machine-readable exploitation queue.
- **Purpose of this Document:** This report provides the strategic context, dominant vulnerability patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.
- **Scope:** External attacker, internet-accessible surface at `https://www.aitcommunity.org` only.

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Missing Global-Scope Authorization Guard (Vertical)
- **Description:** Several privilege-gated operations (pin thread, lock thread, create challenge, claim agent) are partially guarded—checks exist for community-scoped objects but fall through with no guard when the `communityId` field is absent (global/platform-level objects).
- **Implication:** Any authenticated user can exercise moderator-level control over global forum threads and create official-looking challenges labeled as sponsored content.
- **Representative:** AUTHZ-VULN-01 (claimAgent bypass), AUTHZ-VULN-02 (challenges.create), AUTHZ-VULN-03 (forum.pinThread), AUTHZ-VULN-04 (forum.lockThread)

### Pattern 2: Missing Prior-State Validation in Multi-Step Workflows (Context)
- **Description:** Several workflow endpoints accept requests at a "later" step without first verifying that the prior step reached its required terminal state. The authorization model checks *who* but not *where in the workflow*.
- **Implication:** Challenge creators can approve solutions on arbitrary enrollment states; trusted authors can repeatedly re-publish content to farm XP awards.
- **Representative:** AUTHZ-VULN-06 (challenges.reviewSolution), AUTHZ-VULN-07 (articles.submit)

### Pattern 3: Missing Webhook Signature Verification (Context)
- **Description:** The Mollie payment webhook endpoint accepts unauthenticated POST requests, trusts the `paymentId` from the request body as the only identifier, and unconditionally writes `paymentStatus` to the database before checking registration state.
- **Implication:** An attacker with knowledge of a valid Mollie payment ID can replay webhook calls to manipulate event registration statuses.
- **Representative:** AUTHZ-VULN-05 (/api/mollie/webhook)

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture
- Sessions use Better Auth v1.4.5 with session tokens stored as HTTP-only cookies (`better-auth.session_token` / `__Secure-better-auth.session_token`).
- On each tRPC request, `createTRPCContext` calls `auth.api.getSession({headers})` which validates the session cookie against the PostgreSQL `session` table.
- **Critical Finding:** Session user ID is reliably extracted and trusted. The vulnerabilities documented here are not authentication bypasses—they are authorization logic gaps that exist *after* authentication succeeds.

### Role/Permission Model
- **Four privilege tiers identified:** `anon` (0), `user` (1), community-scoped roles (member/moderator/admin/owner, levels 2–5), and PayloadCMS admin/editor (separate auth domain).
- Agent API keys form a parallel auth domain with scope arrays (`read`, `contribute`, `self-profile`).
- **Critical Finding:** Community roles are correctly enforced *when* a `communityId` is present. The gap is at the platform/global level—there is no "global moderator" or "platform admin" role in the tRPC tier that can be checked for non-community operations. The `pinThread` and `lockThread` guards are gated on `if (thread.communityId)`, creating a dead zone for global threads.
- Role checks are not middleware-enforced at the router level; each procedure must call them explicitly. This leads to the pattern where `challenges.create` uses only `protectedProcedure` (session check) with no additional role check.

### Resource Access Patterns
- Most tRPC endpoints use input parameters (IDs, slugs) to identify target resources.
- **Critical Finding for claimAgent:** The `claimAgent` procedure accepts either `{token}` (requires knowledge of a secret one-time token) or `{agentId}` (requires only the agent's public UUID, no secret). The `agentId` path fetches the agent by ID + `status='unclaimed'`, then performs a token *expiry* check on `claimTokenExpiresAt`. The expiry check runs on the already-fetched row regardless of path—but the fundamental authorization asymmetry is that `agentId` alone (a non-secret) is sufficient to claim any unclaimed agent.

### Payment Webhook Architecture
- The Mollie webhook at `/api/mollie/webhook` is a completely unauthenticated POST handler.
- It extracts `paymentId` from `FormData`, calls `mollie.payments.get(paymentId)` to fetch real status from Mollie's API, then updates the local `eventRegistrations` table.
- **Critical Finding:** The `paymentStatus` column update (line 51 in the route) executes unconditionally—before checking `registration.status`. This means any attacker who knows a valid Mollie payment ID can trigger a status write on that registration. While Mollie API returns authentic payment state (spoofing the Mollie response is not possible), the lack of signature verification means legitimate payment IDs from the attacker's own account can be replayed or cross-submitted.

### PayloadCMS Secret Architecture
- `payload.config.ts` resolves the secret as: `process.env.PAYLOAD_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me"`.
- This secret is used for JWT signing and encryption of PayloadCMS admin session tokens.
- **Critical Finding:** If neither env var is set in production, the hardcoded fallback `"dev-secret-change-me"` is a publicly known value, enabling forged admin JWT tokens.

---

## 4. Detailed Vulnerability Findings

### AUTHZ-VULN-01: Unclaimed Agent Takeover via agentId Path
- **Type:** Vertical
- **Endpoint:** `POST /api/trpc/agentManagement.claimAgent`
- **Vulnerable Code:** `src/server/api/routers/agent-management.ts` lines 921–930
- **Role Context:** Any authenticated user (`user` role) who does not already own an agent
- **Guard Evidence:** The `token` path requires a secret claim token. The `agentId` path only requires `id = agentId AND status = 'unclaimed'` — no secret. Token expiry fires after fetch on both paths but does not require the claim token to be validated on the agentId path.
- **Side Effect:** Agent ownerId set to attacker userId, status set to "active", API keys upgraded to claimed-agent scopes, inbox conversation created.
- **Reason:** Two code paths exposed for one mutation. agentId path requires only a non-secret UUID; any authenticated user can claim any unclaimed agent.
- **Confidence:** High

### AUTHZ-VULN-02: Unprivileged Challenge Creation with Sponsor Attribution
- **Type:** Vertical
- **Endpoint:** `POST /api/trpc/challenges.create`
- **Vulnerable Code:** `src/server/api/routers/challenges.ts` lines 713–754
- **Role Context:** Any authenticated user (`user` role)
- **Guard Evidence:** Only `protectedProcedure` (session check). No admin/sponsor/privileged role check in lines 713–830. `publishedBy` hardcoded to `"sponsor"`.
- **Side Effect:** Challenge created in PayloadCMS with `publishedBy: "sponsor"`, attacker becomes creatorId and gains `reviewSolution` power over all participants.
- **Reason:** Missing role gate. Any user can create sponsor-attributed challenges and act as challenge arbiter.
- **Confidence:** High

### AUTHZ-VULN-03: Arbitrary Global Thread Pin by Any Authenticated User
- **Type:** Vertical
- **Endpoint:** `POST /api/trpc/forum.pinThread`
- **Vulnerable Code:** `src/server/api/routers/forum.ts` lines 594–627
- **Role Context:** Any authenticated user (`user` role)
- **Guard Evidence:** `if (thread.communityId) { moderator check }` — the guard block is skipped entirely for threads where `communityId` is null. `payload.update` executes unconditionally.
- **Side Effect:** Any global forum thread's `isPinned` field set to true/false by any authenticated user.
- **Reason:** Authorization check does not dominate all code paths. Missing fallback guard for non-community threads.
- **Confidence:** High

### AUTHZ-VULN-04: Arbitrary Global Thread Lock by Any Authenticated User
- **Type:** Vertical
- **Endpoint:** `POST /api/trpc/forum.lockThread`
- **Vulnerable Code:** `src/server/api/routers/forum.ts` lines 629–662
- **Role Context:** Any authenticated user (`user` role)
- **Guard Evidence:** `if (thread.communityId) { moderator check }` — identical conditional gap. Global threads reach `payload.update` with no authorization.
- **Side Effect:** Any global forum thread's `isLocked` field set to true/false, silencing or restoring all replies.
- **Reason:** Identical structural flaw to AUTHZ-VULN-03.
- **Confidence:** High

### AUTHZ-VULN-05: Unauthenticated Mollie Webhook — Payment Status Manipulation
- **Type:** Context/Workflow
- **Endpoint:** `POST /api/mollie/webhook`
- **Vulnerable Code:** `src/app/api/mollie/webhook/route.ts` lines 26–51
- **Role Context:** Anonymous (no authentication required)
- **Guard Evidence:** No HMAC/signature verification. `paymentId` from attacker-controlled FormData. `paymentStatus` column update at lines 48–51 fires unconditionally before checking registration.status.
- **Side Effect:** For any eventRegistration whose paymentId is known: paymentStatus column unconditionally overwritten; if Mollie reports "paid" and registration is "pending_payment", registration promoted to "registered" with XP award.
- **Reason:** No request authentication. Attacker can replay own legitimate paymentIds or submit other users' IDs to manipulate registration state.
- **Confidence:** High

### AUTHZ-VULN-06: Challenge Solution Review Without Submission State Check
- **Type:** Context/Workflow
- **Endpoint:** `POST /api/trpc/challenges.reviewSolution`
- **Vulnerable Code:** `src/server/api/routers/challenges.ts` lines 963–979
- **Role Context:** Challenge creator (user who called challenges.create)
- **Guard Evidence:** Enrollment lookup filters only on `(challengeId, userId)` — no status filter. Compare to `submitSolution` line 846 which requires `status = 'active'`.
- **Side Effect:** Creator can approve peer-review objectives on enrollments in any state (active, abandoned, completed), potentially awarding XP without legitimate submission.
- **Reason:** Workflow requires enroll → submit → review. Review step omits prior-state validation.
- **Confidence:** Medium

### AUTHZ-VULN-07: Trusted Author Article Re-publish XP Farming
- **Type:** Context/Workflow
- **Endpoint:** `POST /api/trpc/articles.submit`
- **Vulnerable Code:** `src/server/api/routers/articles.ts` lines 185–240
- **Role Context:** Trusted author (authenticated user with sufficient XP/badges)
- **Guard Evidence:** No check on `article.status` before allowing re-submission. `delete` procedure (lines 283–310) explicitly blocks published articles; `submit` does not. Trusted path unconditionally calls `awardXP(XP_AMOUNTS.ARTICLE_PUBLISHED)`.
- **Side Effect:** Re-publishing an already-published article re-triggers XP awards, badge checks, and activity log entries.
- **Reason:** Expected workflow is create → submit → publish (once). Missing prior-state guard allows repeated XP accrual from a single article.
- **Confidence:** Medium

### AUTHZ-VULN-08: PayloadCMS Admin JWT Forgery via Hardcoded Secret Fallback
- **Type:** Vertical
- **Endpoint:** `POST /admin/login` (PayloadCMS admin panel)
- **Vulnerable Code:** `src/payload.config.ts` lines 146–149
- **Role Context:** Anonymous (if env vars absent in production)
- **Guard Evidence:** `secret: process.env.PAYLOAD_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me"`. Known fallback enables JWT forgery.
- **Side Effect:** Full PayloadCMS admin access — read/write/delete all 20 collections.
- **Reason:** If neither env var is configured in production, signing secret is publicly known.
- **Confidence:** Low (depends on production configuration)

### AUTHZ-VULN-09: Forum Rules Acceptance Bypass for Global Threads
- **Type:** Context/Workflow
- **Endpoint:** `POST /api/trpc/forum.createThread`, `POST /api/trpc/forum.submitIdea`
- **Vulnerable Code:** `src/server/api/routers/forum.ts` lines 18–52 (`requireRulesAcceptance`)
- **Role Context:** Any authenticated user (`user` role)
- **Guard Evidence:** `if (!communityId) return;` at line 19. Since `communitySlug` is optional in both procedures, omitting it bypasses all rules-acceptance enforcement.
- **Side Effect:** Global forum threads/ideas created without user having accepted forum rules.
- **Reason:** Helper designed for community-specific rules; global threads have no compensating check.
- **Confidence:** Low

---

## 5. Vectors Analyzed and Confirmed Secure

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|---|---|---|---|
| `POST /api/trpc/agentManagement.reviewDraft` | `agent-management.ts:664–673` | `UPDATE ... WHERE id=X AND ownerId=userId` atomic | SAFE |
| `POST /api/trpc/agentManagement.dismissSuggestion` | `agent-management.ts:757–766` | `UPDATE ... WHERE id=X AND ownerId=userId` atomic | SAFE |
| `GET /api/trpc/inbox.getMessages` | `inbox.ts:216–232` | Participant lookup before message fetch | SAFE |
| `POST /api/trpc/notifications.markRead` | `notifications.ts:54–64` | `UPDATE ... WHERE userId=userId` atomic | SAFE |
| `POST /api/trpc/notifications.delete` | `notifications.ts:82–89` | `DELETE ... WHERE id=X AND userId=userId` atomic | SAFE |
| `GET /api/trpc/challenges.getProgress` | `challenges.ts:376–384` | `challengeId AND userId` double-bound | SAFE |
| `POST /api/trpc/challenges.reviewSolution` | `challenges.ts:949–960` | Creator check + enrollment bound by challengeId | SAFE (horizontal) |
| `GET /api/trpc/members.getPublicProfile` | `members.ts:131` | `isPublic = true` filter in SQL | SAFE |
| `POST /api/trpc/launchpad.deleteComment` | `launchpad.ts:662–678` | Fetch-then-compare before DELETE | SAFE |
| `POST /api/trpc/launchpad.update` | `launchpad.ts:357–365` | Fetch-then-compare before UPDATE | SAFE |
| `POST /api/trpc/forum.editThread` | `forum.ts:685–701` | Ownership check; mod bypass scoped to thread communityId | SAFE |
| `POST /api/trpc/forum.deleteThread` | `forum.ts:734–752` | Ownership + community-scoped mod check before soft-delete | SAFE |
| `POST /api/trpc/forum.editReply` | `forum.ts:787–803` | Ownership; mod bypass scoped to reply communityId | SAFE |
| `POST /api/trpc/forum.deleteReply` | `forum.ts:835–853` | Ownership + community-scoped mod check | SAFE |
| `POST /api/trpc/forum.upsertRules` | `forum.ts:897–914` | Requires owner/admin in community | SAFE |
| `POST /api/trpc/forum.updateIdeaStatus` | `forum.ts:968–979` | Requires owner/admin; communityId from DB record | SAFE |
| `POST /api/trpc/events.cancelRegistration` | `events.ts:203–212` | `UPDATE ... WHERE eventId=X AND userId=sessionUserId` atomic | SAFE |
| `POST /api/trpc/communities.join` | `communities.ts:279` | `joinPolicy !== "open"` throws FORBIDDEN | SAFE |
| `POST /api/trpc/agent.reportObjectiveProgress` | `agent.ts:1700` | Enrollment requires `status = 'active'`; `completedAt IS NULL` | SAFE |
| `GET /api/[collection]/[id]` (PayloadCMS REST) | PayloadCMS access control | All writes admin-only; media/comments public-read by design | SAFE |

---

## 6. Analysis Constraints and Blind Spots

- **Runtime Environment Variables:** AUTHZ-VULN-08 depends on whether `PAYLOAD_SECRET` or `BETTER_AUTH_SECRET` is set in production. Static analysis cannot confirm this.
- **Mollie Payment ID Discovery:** AUTHZ-VULN-05 impact depends on whether payment IDs are discoverable (leaked in responses, notifications, or URLs).
- **Trusted Author Threshold:** AUTHZ-VULN-07 is constrained to users who have achieved trusted-author status. The exact XP/badge threshold in `isTrustedAuthor()` limits the attack surface.
- **Agent ID Enumeration:** AUTHZ-VULN-01 requires a valid unclaimed agent UUID. `listUnclaimedAgents` and MCP `browse-members` may expose these.
- **MCP Tool Authorization:** The ~50 MCP tools at `/api/mcp` were not independently audited; they are assumed to delegate to the same tRPC procedures analyzed here.

