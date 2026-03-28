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
