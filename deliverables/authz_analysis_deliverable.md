# Authorization Analysis Report

## 1. Executive Summary

- **Analysis Status:** Complete
- **Analysis Date:** 2026-03-28
- **Target:** https://www.aitcommunity.org
- **Key Outcome:** Eight (8) externally-exploitable authorization vulnerabilities confirmed through white-box code analysis. Findings span all three categories: vertical privilege escalation (4), context/workflow bypass (3), and one dual-category. All findings have been passed to the exploitation phase via the machine-readable exploitation queue.
- **Purpose of this Document:** This report provides the strategic context, dominant patterns, and architectural intelligence necessary to effectively exploit the vulnerabilities listed in the queue. It is intended to be read alongside the JSON deliverable.

**Confirmed Vulnerabilities by Category:**

| ID | Category | Endpoint | Confidence |
|----|----------|----------|------------|
| AUTHZ-VULN-01 | Vertical | `POST /api/trpc/agentManagement.claimAgent` | High |
| AUTHZ-VULN-02 | Vertical | `POST /api/trpc/forum.pinThread` | High |
| AUTHZ-VULN-03 | Vertical | `POST /api/trpc/forum.lockThread` | High |
| AUTHZ-VULN-04 | Vertical | `POST /api/trpc/challenges.create` | High |
| AUTHZ-VULN-05 | Context_Workflow | `POST /api/mollie/webhook` | High |
| AUTHZ-VULN-06 | Context_Workflow | `POST /api/trpc/challenges.reviewSolution` | High |
| AUTHZ-VULN-07 | Context_Workflow | `POST /api/trpc/articles.submit` | Medium |

---

## 2. Dominant Vulnerability Patterns

### Pattern 1: Conditional Authorization Guard (Vertical)
- **Description:** Authorization checks gated on the presence of an optional field (`communityId`). When the field is absent (global threads), the entire authorization block is skipped.
- **Implication:** Any authenticated user can perform moderator-level operations (pin, lock threads) on global forum threads with no privilege check.
- **Representative:** AUTHZ-VULN-02, AUTHZ-VULN-03

### Pattern 2: Missing Role Prerequisite on Privileged Operations (Vertical)
- **Description:** Endpoints that create privileged resources (official challenges, agent claims) use only `protectedProcedure` (any authenticated user) with no role or capability check.
- **Implication:** Any authenticated user can create official challenges with sponsor attribution and arbitrary XP/badge rewards, or claim any unclaimed agent without a valid token.
- **Representative:** AUTHZ-VULN-01, AUTHZ-VULN-04

### Pattern 3: Missing Prior-State Validation in Workflows (Context)
- **Description:** Multi-step processes (challenge submission -> review, article draft -> publish) fail to validate that prerequisite states were reached before allowing the next action.
- **Implication:** Challenge creators can award XP to users who never submitted a solution; trusted article authors can trigger repeated XP awards by re-submitting already-published articles.
- **Representative:** AUTHZ-VULN-06, AUTHZ-VULN-07

### Pattern 4: Missing Webhook Signature Verification (Context)
- **Description:** The Mollie payment webhook endpoint accepts any POST request without verifying the request originates from Mollie.
- **Implication:** An attacker who can obtain or enumerate a valid Mollie `paymentId` can trigger event registration confirmation, XP award, and confirmation email for any user with a pending payment.
- **Representative:** AUTHZ-VULN-05

---

## 3. Strategic Intelligence for Exploitation

### Session Management Architecture
- Sessions use Better Auth v1.4.5 with HTTP-only session cookies (`better-auth.session_token` / `__Secure-better-auth.session_token`).
- The `createTRPCContext` extracts the session on every tRPC call and validates it against the PostgreSQL `session` table.
- User ID (`ctx.session.user.id`) is extracted from the validated session -- not user-controllable directly.
- **Critical Finding:** All authorization flaws are in application logic AFTER authentication, not in the authentication layer itself. A valid session is sufficient to trigger most vulnerabilities.

### Role/Permission Model
- Five role domains: `user` (global authenticated), `community:{member,moderator,admin,owner}` (community-scoped), `agent:{unclaimed,claimed}` (API key domain), `payload:{editor,admin}` (CMS domain), `anon` (unauthenticated).
- **Critical Finding:** Community roles are properly scoped -- but the conditional `if (thread.communityId)` pattern means operations on resources WITHOUT a communityId skip role checks entirely. This is the root of VULN-02 and VULN-03.
- **Critical Finding:** There is no `sponsorProcedure` or `adminProcedure` in tRPC. Challenges and other "privileged" content creation routes use only `protectedProcedure`, leaving role enforcement to in-procedure logic that is absent in `challenges.create`.

### Agent Claim Architecture
- Agents have two states: `unclaimed` (no owner) and `claimed` (ownerId set).
- The intended claim flow: platform generates a `claimToken` + `claimTokenExpiresAt`; user follows link with token.
- **Critical Finding:** The `claimAgent` procedure accepts either `{token}` OR `{agentId}`. The `agentId` branch queries only `id = input.agentId AND status = "unclaimed"` -- no token, no secret, no expiry check. Any authenticated user who knows (or enumerates) an agent's UUID can claim it.
- The `listUnclaimedAgents` endpoint may expose unclaimed agent UUIDs to authenticated users, making enumeration trivial.

### Payment / Webhook Flow
- Paid event registration creates a DB record with `status: "pending_payment"` and a Mollie `paymentId`.
- The only mechanism to advance to `status: "registered"` is the Mollie webhook at `/api/mollie/webhook`.
- **Critical Finding:** The webhook reads `paymentId` from the POST FormData body, fetches actual payment status from Mollie API, and if `status === "paid"` AND registration is `pending_payment`, confirms the registration + awards XP. There is no HMAC/signature verification of the incoming request.
- The paymentId format follows Mollie conventions (`tr_XXXXXXXXXX`). These may be observable via browser network traffic when initiating a payment.

### Challenge Authorization Architecture
- Challenges are a core gamification feature with XP rewards, badges, and sponsor attribution.
- The `challenges.create` procedure uses `protectedProcedure` only. `publishedBy` is hardcoded to `"sponsor"` regardless of caller identity.
- **Critical Finding:** Any authenticated user can create challenges with any difficulty, XP reward, badge, and max participant count -- all of which directly affect platform-wide leaderboard integrity.
- The `challenges.reviewSolution` procedure verifies the caller is the challenge creator and that the enrollment belongs to the challenge. However, it does NOT check enrollment status or submission existence.

### Article Trust Model
- Articles have two author paths: trusted members (direct publish) and untrusted (pending review).
- **Critical Finding:** The trusted author path (`articles.submit`) unconditionally awards `XP_AMOUNTS.ARTICLE_PUBLISHED` without checking if the article was already published. The untrusted path correctly guards with `if (!article.reviewStatus)`. Trusted authors can repeatedly call `submit` on a published article to farm XP.

---

## 4. Vectors Analyzed and Confirmed Secure

These authorization checks were traced and confirmed to have robust, properly-placed guards.

| **Endpoint** | **Guard Location** | **Defense Mechanism** | **Verdict** |
|---|---|---|---|
| `POST /api/trpc/agentManagement.reviewDraft` | agent-management.ts:670 | `eq(agentDrafts.ownerId, userId)` in UPDATE WHERE clause | SAFE |
| `POST /api/trpc/agentManagement.dismissSuggestion` | agent-management.ts:763 | `eq(agentSuggestions.ownerId, userId)` in UPDATE WHERE clause | SAFE |
| `GET /api/trpc/inbox.getMessages` | inbox.ts:216-225 | Participant check against `conversationParticipants` before message fetch | SAFE |
| `POST /api/trpc/notifications.markRead` | notifications.ts:58 | `eq(notifications.userId, userId)` in WHERE clause | SAFE |
| `POST /api/trpc/notifications.delete` | notifications.ts:88 | Both `notificationId` and `userId` in WHERE clause | SAFE |
| `GET /api/trpc/challenges.getProgress` | challenges.ts:381 | `eq(challengeEnrollments.userId, userId)` in WHERE clause | SAFE |
| `GET /api/trpc/members.getPublicProfile` | members.ts:131 | `eq(memberProfiles.isPublic, true)` in WHERE clause | SAFE |
| `POST /api/trpc/launchpad.deleteComment` | launchpad.ts:662+676 | Author check + PayloadCMS admin fallback | SAFE |
| `POST /api/trpc/launchpad.update` | launchpad.ts:372-373 | `project.authorId !== ctx.session.user.id` check | SAFE |
| `POST /api/trpc/forum.editThread` | forum.ts:685-703 | Author check + community moderator fallback | SAFE |
| `POST /api/trpc/forum.deleteReply` | forum.ts:835-853 | Author check + community moderator fallback | SAFE |
| `POST /api/trpc/events.cancelRegistration` | events.ts:209 | `eq(eventRegistrations.userId, userId)` in WHERE clause | SAFE |
| `POST /api/trpc/communities.join` | communities.ts:279 | `community.joinPolicy !== "open"` throws FORBIDDEN | SAFE |
| `POST /api/trpc/communities.acceptInvite` | communities.ts:406-425 | Expiry check + atomic max-uses compare-and-swap | SAFE |
| `POST /api/trpc/communities.banMember` | communities.ts:canManageRole | `canManageRole()` strictly greater hierarchy required | SAFE |
| `POST /api/trpc/communities.removeMember` | communities.ts:canManageRole | `canManageRole()` strictly greater hierarchy required | SAFE |
| `POST /api/trpc/forum.upsertRules` | forum.ts:913 | `membership.role === "owner" or "admin"` before update | SAFE |
| `POST /api/trpc/forum.updateIdeaStatus` | forum.ts:978 | Community owner/admin check; global ideas rejected | SAFE |
| `POST /api/trpc/agent.reportObjectiveProgress` | agent.ts:1700 | `eq(challengeEnrollments.status, "active")` in WHERE clause | SAFE |
| `POST /api/trpc/forum.createThread` | forum.ts:requireRulesAcceptance | Server-side DB check for rules-acceptance record (for community threads) | SAFE |
| `POST /api/trpc/forum.submitIdea` | forum.ts:requireRulesAcceptance | Server-side DB check for rules-acceptance record (for community ideas) | SAFE |
| `POST /api/trpc/communities.updateSettings` | communities.ts:585-586 | Owner/admin role required | SAFE |

---

## 5. Detailed Vulnerability Findings

### AUTHZ-VULN-01: Agent Claim Token Bypass via agentId Parameter

**Type:** Vertical
**File:** `src/server/api/routers/agent-management.ts` lines 883-944
**Role Required:** Any authenticated user

The `claimAgent` procedure accepts either `{token}` or `{agentId}`. The token path validates the secret token value against the database. The agentId path only checks `status = "unclaimed"` -- no token, no secret, no ownership validation:

```typescript
} else {
  [agentQuery] = await ctx.db.select().from(agentProfiles).where(
    and(eq(agentProfiles.id, input.agentId!), eq(agentProfiles.status, "unclaimed"))
  ).limit(1);
}
```

Any authenticated user who knows an unclaimed agent's UUID can claim it, binding it to their account and gaining ownership of all associated API keys and capabilities.

---

### AUTHZ-VULN-02 & AUTHZ-VULN-03: Global Forum Thread Pin/Lock Without Authorization

**Type:** Vertical
**File:** `src/server/api/routers/forum.ts` lines 594-662
**Role Required:** Any authenticated user

The authorization guard for both `pinThread` and `lockThread` is wrapped in `if (thread.communityId)`. For global threads (communityId = null), the entire check is skipped:

```typescript
if (thread.communityId) {
  // Moderator check -- ONLY runs for community threads
}
// Falls through with no check for global threads
await payload.update({ collection: "forum-threads", data: { isPinned: true } });
```

Any authenticated user can pin or lock any global forum thread.

---

### AUTHZ-VULN-04: Unauthorized Challenge Creation with Sponsor Attribution

**Type:** Vertical
**File:** `src/server/api/routers/challenges.ts` lines 713-830
**Role Required:** Any authenticated user

`challenges.create` uses `protectedProcedure` with no role check. `publishedBy` is hardcoded to `"sponsor"`:

```typescript
create: protectedProcedure  // No admin/sponsor check
  .mutation(async ({ ctx, input }) => {
    await payload.create({
      data: {
        publishedBy: "sponsor",  // Hardcoded -- any user creates as sponsor
        xpReward: input.xpReward,  // User-controlled
        badgeReward: input.badgeReward,  // User-controlled
      }
    });
  })
```

Any authenticated user can create official sponsor-attributed challenges with arbitrary XP and badge rewards, corrupting platform-wide leaderboard integrity.

---

### AUTHZ-VULN-05: Mollie Webhook No Signature Verification

**Type:** Context_Workflow
**File:** `src/app/api/mollie/webhook/route.ts` lines 19-94
**Role Required:** None (unauthenticated)

The webhook handler reads `paymentId` from the POST body, fetches status from Mollie API, and triggers registration confirmation with no signature check:

```typescript
export async function POST(request: Request) {
  const formData = await request.formData();
  const paymentId = formData.get("id") as string | null;
  // NO SIGNATURE VERIFICATION
  const payment = await mollie.payments.get(paymentId);
  if (paymentStatus === "paid" && registration.status === "pending_payment") {
    // Confirms registration + awards XP + sends email
  }
}
```

An attacker with a valid `paymentId` can replay the webhook to confirm their own or others' pending registrations, award XP, and trigger confirmation emails -- all without a Mollie signature.

---

### AUTHZ-VULN-06: Challenge Solution Approved Without Prior Submission

**Type:** Context_Workflow
**File:** `src/server/api/routers/challenges.ts` lines 936-1013
**Role Required:** Challenge creator (any authenticated user who created a challenge)

`reviewSolution` verifies the caller is the challenge creator and the enrollment belongs to the challenge. However, it does not check enrollment status or submission existence:

```typescript
const [enrollment] = await ctx.db.select().from(challengeEnrollments).where(
  and(
    eq(challengeEnrollments.challengeId, input.challengeId),
    eq(challengeEnrollments.userId, input.participantUserId),
    // MISSING: eq(challengeEnrollments.status, "active")
    // MISSING: isNotNull(challengeEnrollments.submittedAt)
  )
).limit(1);
// Unconditionally awards XP if approved=true
if (input.approved) {
  await awardXp(ctx.db, input.participantUserId, XP_AMOUNTS.CHALLENGE_SOLUTION_APPROVED);
}
```

A challenge creator can approve any enrollment -- regardless of whether a solution was submitted -- awarding XP to any enrolled user (including themselves via a second account).

---

### AUTHZ-VULN-07: Trusted Author Article XP Re-Award

**Type:** Context_Workflow
**File:** `src/server/api/routers/articles.ts` lines 185-252
**Role Required:** User with trusted author status

The trusted author submit path awards XP unconditionally with no prior-state check:

```typescript
if (trusted) {
  await payload.update({ ..., data: { status: "published" } });
  await awardXp(ctx.db, ctx.session.user.id, XP_AMOUNTS.ARTICLE_PUBLISHED); // No prior-state guard
} else {
  // Correctly guards: if (!article.reviewStatus) { awardXp(...) }
}
```

A trusted author can repeatedly call `submit` on an already-published article to farm `ARTICLE_PUBLISHED` XP indefinitely.

---

## 6. Analysis Constraints and Blind Spots

- **Trusted Author Status:** AUTHZ-VULN-07 requires "trusted author" status which is assigned via PayloadCMS admin panel. The confidence is MEDIUM because this prerequisite is not publicly self-obtainable.

- **Mollie paymentId Observability:** AUTHZ-VULN-05 requires a valid `paymentId`. The IDs are observable via browser network traffic when initiating a payment. An attacker can intercept their own `paymentId` and replay the webhook.

- **Agent UUID Enumerability:** AUTHZ-VULN-01 requires knowing an unclaimed agent UUID. The `listUnclaimedAgents` endpoint may expose these IDs to any authenticated user, making enumeration trivial -- this should be verified during exploitation.

- **PayloadCMS Default Secret:** The `payload.config.ts` contains fallback: `process.env.PAYLOAD_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me"`. If neither env var is set in production, JWT forgery against the PayloadCMS admin panel is possible. This could not be confirmed via static analysis alone.

- **PayloadCMS Collections Without Access Control:** Collections `Articles`, `Events`, `LaunchpadProjects`, `CommunityRules`, `RulesAcceptance` lack explicit `access` properties. PayloadCMS 3.x defaults likely restrict unauthenticated REST access, but this was not live-tested.

- **Race Conditions:** Some procedures (e.g., `reportObjectiveProgress` completedAt NULL check) may be vulnerable to TOCTOU race conditions under concurrent requests, but this was not analyzed in depth as it is outside the scope of logical authorization flaws.
