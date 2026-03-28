# Reconnaissance Deliverable: AIT Community (aitcommunity.org)

## 0) HOW TO READ THIS

This reconnaissance report provides a comprehensive map of the application's attack surface, with special emphasis on authorization and privilege escalation opportunities for the Authorization Analysis Specialist.

**Key Sections for Authorization Analysis:**
- **Section 4 (API Endpoint Inventory):** Contains authorization details for each endpoint — focus on "Required Role" and "Object ID Parameters" columns to identify IDOR candidates.
- **Section 6.4 (Guards Directory):** Catalog of authorization controls — understand what each guard means before analyzing vulnerabilities.
- **Section 7 (Role & Privilege Architecture):** Complete role hierarchy and privilege mapping — use this to understand the privilege lattice and identify escalation targets.
- **Section 8 (Authorization Vulnerability Candidates):** Pre-prioritized lists of endpoints for horizontal, vertical, and context-based authorization testing.

**How to Use the Network Mapping (Section 6):** The entity/flow mapping shows system boundaries and data sensitivity levels. Pay special attention to flows marked with authorization guards and entities handling PII/sensitive data.

**Priority Order for Testing:** Start with Section 8's High-priority horizontal candidates, then vertical escalation endpoints for each role level, finally context-based workflow bypasses.

---

## 1. Executive Summary

AIT Community (`https://www.aitcommunity.org`) is a full-stack community platform where human engineers and AI agents collaborate through forums, events, challenges, a launchpad for projects, and direct messaging. The application is a **Next.js 15** monolith deployed on **Vercel** (serverless), using **TypeScript** strict mode throughout.

**Core technology stack:** Next.js 15 / React 19 (frontend), tRPC (API layer), Drizzle ORM + PostgreSQL/Neon (data), Better Auth v1.4.5 (authentication), PayloadCMS (content management), Vercel (hosting), AWS S3 (media), Mollie (payments), Resend (email).

**Primary attack surface components:**
1. The tRPC gateway at `/api/trpc/[trpc]` exposing 260+ procedures across 22 routers
2. The MCP (Model Context Protocol) server at `/api/mcp` with unauthenticated agent registration
3. The Better Auth endpoint cluster at `/api/auth/*` for login, registration, OAuth, password reset
4. The PayloadCMS REST API at `/api/*` with 20 collections
5. The PayloadCMS admin panel at `/admin` (separate auth system)
6. The Mollie payment webhook at `/api/mollie/webhook` (no signature verification)
7. The agent webhook endpoint at `/api/agent/webhook` (API key auth)
8. The file upload endpoint at `/api/upload`
9. Seven cron endpoints at `/api/cron/*` (shared CRON_SECRET)

---

## 2. Technology & Service Map

- **Frontend:** Next.js 15.4.11, React 19.0.0, Tailwind CSS, shadcn/ui, Lexical (rich-text editor), next-intl (i18n EN/NL), tRPC React hooks, SuperJSON serialization
- **Backend:** TypeScript 5.8.2 (strict), Next.js App Router API routes, tRPC v11, Drizzle ORM v0.41.0, Better Auth v1.4.5, PayloadCMS 3.x
- **Infrastructure:** Vercel (serverless), Neon PostgreSQL (serverless), AWS S3 (media), Cloudflare (inferred from nmap/CDN), Resend (email `noreply@mailer.aitcommunity.org`)
- **Identified Subdomains:**
  - `www.aitcommunity.org` — main application
  - `mailer.aitcommunity.org` — email sending domain (Resend)
- **Open Ports & Services:**
  - `:443` HTTPS — main application (Vercel edge)
  - `:80` HTTP — redirects to HTTPS
- **Third-party Services:** Mollie (payments), GitHub OAuth, Luma (calendar/events), Twitter oEmbed API, Amazon S3

---

## 3. Authentication & Session Management Flow

### Entry Points
| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/sign-in/email` | POST | Email/password login |
| `/api/auth/sign-up/email` | POST | Email/password registration |
| `/api/auth/sign-out` | POST | Session logout |
| `/api/auth/callback/github` | GET | GitHub OAuth callback |
| `/api/auth/verify-email` | GET/POST | Email verification |
| `/api/auth/forgot-password` | POST | Password reset request |
| `/api/auth/reset-password` | POST | Password reset completion |
| `/api/auth/get-session` | GET | Session validation |
| `/api/auth/[...all]` | GET, POST | Better Auth catch-all |

**Application pages:** `/en/auth/signin`, `/en/auth/signup`, `/en/auth/forgot-password`, `/en/auth/reset-password`, `/en/claim/[token]` (agent claim), `/en/join/[code]` (community invite)

### Mechanism
1. User submits credentials to `/api/auth/sign-in/email` (JSON body: `{email, password}`)
2. Better Auth validates credentials via bcrypt, checks `emailVerified=true`, creates session record in PostgreSQL `session` table
3. Session token set as HTTP cookie. Two cookie name variants exist: `better-auth.session_token` (standard) and `__Secure-better-auth.session_token` (Secure-prefixed in production)
4. On each tRPC request, `createTRPCContext` calls `auth.api.getSession({headers})` which extracts the session cookie and validates it against the DB
5. **GitHub OAuth:** `/api/auth/callback/github` → Better Auth handles the flow internally with configured `trustedOrigins`
6. **Password reset:** Token sent via Resend email → `/api/auth/reset-password` with `{token, newPassword}`

**Code Pointers:**
- `src/server/better-auth/config.ts` — Authentication configuration (providers, email verification hooks)
- `src/server/better-auth/server.ts` — Server-side auth handler
- `src/server/better-auth/base-url.ts` — Base URL resolution and trusted origins (dev mode trusts `host` header)
- `src/app/api/auth/[...all]/route.ts` — Auth API catch-all route
- `src/server/api/trpc.ts` lines 33-42 — Session extraction per request

### 3.1 Role Assignment Process
- **Role Determination:** Community roles assigned at join/invite time. Global roles determined by PayloadCMS user table (`admin`/`editor`). For agent procedures, scopes are embedded in `agentApiKeys.scopes` JSON array.
- **Default Role:** New community members receive `role: "member"`, `status: "active"`. New users have no community affiliation until they join.
- **Role Upgrade Path:** Community role upgrades require an existing `owner` or `admin` to call `setMemberRole` (enforced by `canManageRole()` hierarchy check). No self-service escalation. Agent scope upgrades happen at claim time (unclaimed → claimed agent gains additional scopes).
- **Code Implementation:** `src/server/communities/role-utils.ts` (role hierarchy), `src/server/api/routers/communities.ts` lines 690-740 (setMemberRole)

---

## 4. API Endpoint Inventory

**Network Surface Focus:** Only network-accessible endpoints reachable via HTTP(S) to `aitcommunity.org`.

### 4.1 Direct HTTP API Routes

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET, POST | `/api/auth/[...all]` | anon | None | None (is auth) | Better Auth catch-all — login, signup, OAuth, password reset. `src/app/api/auth/[...all]/route.ts` |
| GET, POST | `/api/trpc/[trpc]` | Per-procedure | Per-procedure | Per-procedure middleware | tRPC gateway for all 260+ procedures. `src/app/api/trpc/[trpc]/route.ts` |
| GET, POST, DELETE | `/api/mcp` | anon (register) or agent (tools) | None | Bearer API key OR unauthenticated (IP rate-limit) | MCP server with ~50 tools + unauthenticated registration. `src/app/api/mcp/route.ts` |
| GET | `/api/agent/webhook` | agent | None | Bearer API key | Get agent webhook config. `src/app/api/agent/webhook/route.ts` line 41 |
| PUT | `/api/agent/webhook` | agent | None | Bearer API key | Register/update agent webhook URL. `src/app/api/agent/webhook/route.ts` line 67 |
| DELETE | `/api/agent/webhook` | agent | None | Bearer API key | Delete agent webhook. `src/app/api/agent/webhook/route.ts` line 153 |
| POST | `/api/mollie/webhook` | anon | None | **None (no sig verification)** | Mollie payment status webhook. `src/app/api/mollie/webhook/route.ts` |
| POST | `/api/upload` | user (session) | None | Session cookie | Image upload endpoint (2MB, image/* only, MIME spoofable). `src/app/api/upload/route.ts` |
| GET | `/api/cron/agent-purge` | cron | None | Bearer CRON_SECRET | Expire/delete unclaimed agents. `src/app/api/cron/agent-purge/route.ts` |
| GET | `/api/cron/challenge-advisory` | cron | None | Bearer CRON_SECRET | Send challenge advice notifications. `src/app/api/cron/challenge-advisory/route.ts` |
| GET | `/api/cron/challenge-digest` | cron | None | Bearer CRON_SECRET | Weekly challenge activity digest. `src/app/api/cron/challenge-digest/route.ts` |
| GET | `/api/cron/challenge-expiry` | cron | None | Bearer CRON_SECRET | Expire challenges and award partial XP. `src/app/api/cron/challenge-expiry/route.ts` |
| GET | `/api/cron/impact-aggregation` | cron | None | Bearer CRON_SECRET | Compute daily impact metrics. `src/app/api/cron/impact-aggregation/route.ts` |
| GET | `/api/cron/stale-review-reminder` | cron | None | Bearer CRON_SECRET | Send stale peer review reminders. `src/app/api/cron/stale-review-reminder/route.ts` |
| GET | `/api/cron/webhook-dispatch` | cron | None | Bearer CRON_SECRET | Dispatch queued outbound webhooks. `src/app/api/cron/webhook-dispatch/route.ts` |
| ALL | `/api/[...slug]` | admin (PayloadCMS) | collection slug, doc id | PayloadCMS session auth | PayloadCMS REST API for 20 collections. `src/app/(payload)/api/[...slug]/route.ts` |
| GET | `/admin` | PayloadCMS admin/editor | None | PayloadCMS session | Admin panel login/dashboard. `/admin/login` redirects unauthenticated. |
| GET | `/agent.md` | anon | None | None | Public agent onboarding guide (static). `src/app/agent.md/route.ts` |
| GET | `/skill.md` | anon | None | None | Public skill description (static). `src/app/skill.md/route.ts` |
| GET | `/feed.xml` | anon | None | None | RSS feed with XML-escaped content. `src/app/feed.xml/route.ts` |

### 4.2 tRPC Procedures — Public (No Auth)

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/api/trpc/post.hello` | anon | None | None | Test endpoint. `src/server/api/routers/post.ts` line 11 |
| GET | `/api/trpc/forum.getRules` | anon | None | None | Get forum rules. `src/server/api/routers/forum.ts` line 57 |
| GET | `/api/trpc/forum.getIdeas` | anon | None | None | Browse ideas board. `src/server/api/routers/forum.ts` line 173 |
| GET | `/api/trpc/forum.getThreads` | anon | None | None | Browse forum threads. `src/server/api/routers/forum.ts` line 336 |
| GET | `/api/trpc/forum.getThread` | anon | threadId | None | Get thread details. `src/server/api/routers/forum.ts` line 402 |
| POST | `/api/trpc/forum.incrementViewCount` | anon | threadId | None | Increment thread view count (unauthenticated write). `src/server/api/routers/forum.ts` line 418 |
| GET | `/api/trpc/forum.getReplies` | anon | threadId | None | Get thread replies. `src/server/api/routers/forum.ts` line 572 |
| GET | `/api/trpc/members.getPublicProfile` | anon | userId | None | Get public member profile. `src/server/api/routers/members.ts` line 122 |
| GET | `/api/trpc/members.listMembers` | anon | None | None | List members with `search` param (LIKE injection). `src/server/api/routers/members.ts` line 173 |
| GET | `/api/trpc/members.getLeaderboard` | anon | None | None | Top 100 members by XP. `src/server/api/routers/members.ts` line 259 |
| GET | `/api/trpc/events.registrationCount` | anon | eventId | None | Get event registration count. `src/server/api/routers/events.ts` line 317 |
| GET | `/api/trpc/events.getAttendees` | anon | eventId | None | List event attendees. `src/server/api/routers/events.ts` line 336 |
| GET | `/api/trpc/events.getCommunityEvents` | anon | communitySlug | None | Get community events. `src/server/api/routers/events.ts` line 368 |
| GET | `/api/trpc/communities.list` | anon | None | None | List public communities with `search` param. `src/server/api/routers/communities.ts` line 29 |
| GET | `/api/trpc/communities.getBySlug` | anon | slug | None | Get community details. `src/server/api/routers/communities.ts` line 94 |
| GET | `/api/trpc/communities.getMembers` | anon | communitySlug | None | List community members. `src/server/api/routers/communities.ts` line 125 |
| GET | `/api/trpc/challenges.list` | anon | None | None | List challenges. `src/server/api/routers/challenges.ts` line 63 |
| GET | `/api/trpc/challenges.getById` | anon | id | None | Get challenge details. `src/server/api/routers/challenges.ts` line 105 |
| GET | `/api/trpc/challenges.getLeaderboard` | anon | challengeId | None | Challenge leaderboard. `src/server/api/routers/challenges.ts` line 400 |
| GET | `/api/trpc/challengeChannel.getChannel` | anon | challengeId | None | Get channel metadata. `src/server/api/routers/challenge-channel.ts` line 22 |
| GET | `/api/trpc/challengeChannel.listThreads` | anon | channelId | None | List challenge threads. `src/server/api/routers/challenge-channel.ts` line 34 |
| GET | `/api/trpc/challengeChannel.getThread` | anon | threadId | None | Get challenge thread + replies. `src/server/api/routers/challenge-channel.ts` line 98 |
| GET | `/api/trpc/benchmark.getLeaderboard` | anon | None | None | Benchmark leaderboard. `src/server/api/routers/benchmark.ts` line 21 |
| GET | `/api/trpc/benchmark.getQuestionStats` | anon | None | None | Question statistics. `src/server/api/routers/benchmark.ts` line 37 |
| GET | `/api/trpc/sponsors.list` | anon | None | None | List all sponsors. `src/server/api/routers/sponsors.ts` line 12 |
| GET | `/api/trpc/sponsors.featured` | anon | None | None | Get featured sponsors. `src/server/api/routers/sponsors.ts` line 24 |
| GET | `/api/trpc/sponsors.jobs` | anon | None | None | List job postings with `search` param. `src/server/api/routers/sponsors.ts` line 90 |
| GET | `/api/trpc/comments.list` | anon | targetId, targetType | None | List comments on target. `src/server/api/routers/comments.ts` line 51 |
| GET | `/api/trpc/launchpad.list` | anon | None | None | List launchpad projects. `src/server/api/routers/launchpad.ts` line 60 |
| GET | `/api/trpc/launchpad.getBySlug` | anon | slug | None | Get project details. `src/server/api/routers/launchpad.ts` line 169 |
| GET | `/api/trpc/impact.getOverview` | anon | None | None | Public impact metrics dashboard. `src/server/api/routers/impact.ts` line 390 |

### 4.3 tRPC Procedures — Protected (Session Auth Required)

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/api/trpc/members.getMyProfile` | user | None | Session cookie | Get own member profile. `src/server/api/routers/members.ts` line 32 |
| POST | `/api/trpc/members.upsertProfile` | user | None | Session cookie | Create/update member profile. `src/server/api/routers/members.ts` line 56 |
| GET | `/api/trpc/impact.getQADetails` | user | None | Session cookie | QA-specific impact details. `src/server/api/routers/impact.ts` line 603 |
| GET | `/api/trpc/agentManagement.getMyAgent` | user | None | Session cookie | Get user's agent. `src/server/api/routers/agent-management.ts` line 29 |
| POST | `/api/trpc/agentManagement.createAgent` | user | None | Session cookie | Create new agent. `src/server/api/routers/agent-management.ts` line 42 |
| POST | `/api/trpc/agentManagement.quickSetup` | user | None | Session cookie | Auto-create agent+API key. `src/server/api/routers/agent-management.ts` line 105 |
| POST | `/api/trpc/agentManagement.updateAgent` | user | None | Session + owner check | Update agent settings. `src/server/api/routers/agent-management.ts` line 194 |
| POST | `/api/trpc/agentManagement.deleteAgent` | user | None | Session + owner check | Deactivate agent. `src/server/api/routers/agent-management.ts` line 238 |
| POST | `/api/trpc/agentManagement.generateKey` | user | None | Session + owner check | Generate new API key. `src/server/api/routers/agent-management.ts` line 272 |
| POST | `/api/trpc/agentManagement.revokeKey` | user | None | Session + owner check | Revoke API keys. `src/server/api/routers/agent-management.ts` line 313 |
| GET | `/api/trpc/agentManagement.getKeyInfo` | user | None | Session + owner check | Get key metadata. `src/server/api/routers/agent-management.ts` line 343 |
| GET | `/api/trpc/agentManagement.getWebhook` | user | None | Session + owner check | **Returns webhook including secret field.** `src/server/api/routers/agent-management.ts` line 454 |
| POST | `/api/trpc/agentManagement.upsertWebhook` | user | None | Session + owner check | Create/update webhook. `src/server/api/routers/agent-management.ts` line 465 |
| POST | `/api/trpc/agentManagement.deleteWebhook` | user | None | Session + owner check | Delete webhook. `src/server/api/routers/agent-management.ts` line 545 |
| POST | `/api/trpc/agentManagement.reenableWebhook` | user | None | Session + owner check | Re-enable webhook. `src/server/api/routers/agent-management.ts` line 554 |
| POST | `/api/trpc/agentManagement.testWebhook` | user | None | Session + owner check + SSRF check | Test webhook (triggers SSRF-relevant fetch). `src/server/api/routers/agent-management.ts` line 564 |
| GET | `/api/trpc/agentManagement.getDrafts` | user | None | Session + owner check | List agent drafts. `src/server/api/routers/agent-management.ts` line 630 |
| POST | `/api/trpc/agentManagement.reviewDraft` | user | draftId | Session + owner check (ownerId only) | Approve/reject draft. `src/server/api/routers/agent-management.ts` line 654 |
| GET | `/api/trpc/agentManagement.getSuggestions` | user | None | Session + owner check | List suggestions. `src/server/api/routers/agent-management.ts` line 724 |
| POST | `/api/trpc/agentManagement.dismissSuggestion` | user | suggestionId | Session + owner check (ownerId only) | Dismiss suggestion. `src/server/api/routers/agent-management.ts` line 748 |
| POST | `/api/trpc/agentManagement.generateInviteCode` | user | None | Session | Generate 24-hr invite code. `src/server/api/routers/agent-management.ts` line 780 |
| GET | `/api/trpc/agentManagement.listInviteCodes` | user | None | Session | List invite codes. `src/server/api/routers/agent-management.ts` line 797 |
| GET | `/api/trpc/agentManagement.listUnclaimedAgents` | user | None | Session | List claimable agents. `src/server/api/routers/agent-management.ts` line 819 |
| GET | `/api/trpc/agentManagement.getAgentByClaimToken` | user | token | Session | Get agent by claim token. `src/server/api/routers/agent-management.ts` line 860 |
| POST | `/api/trpc/agentManagement.claimAgent` | user | token OR agentId | Session | **Dual-path: agentId path bypasses token expiry.** `src/server/api/routers/agent-management.ts` line 883 |
| POST | `/api/trpc/agentManagement.startVerification` | user | None | Session | Generate Twitter verification code. `src/server/api/routers/agent-management.ts` line 998 |
| POST | `/api/trpc/agentManagement.submitVerification` | user | None | Session | Verify via tweet URL. `src/server/api/routers/agent-management.ts` line 1027 |
| GET | `/api/trpc/forum.acceptRules` | user | None | Session | Accept forum rules. `src/server/api/routers/forum.ts` line 113 |
| POST | `/api/trpc/forum.submitIdea` | user | None | Session + rules accepted | Submit idea. `src/server/api/routers/forum.ts` line 225 |
| POST | `/api/trpc/forum.toggleVote` | user | ideaId | Session | Vote on idea. `src/server/api/routers/forum.ts` line 271 |
| POST | `/api/trpc/forum.createThread` | user | None | Session + rules accepted | Create forum thread. `src/server/api/routers/forum.ts` line 435 |
| POST | `/api/trpc/forum.addReply` | user | threadId | Session | Reply to thread. `src/server/api/routers/forum.ts` line 498 |
| POST | `/api/trpc/forum.pinThread` | user | threadId | Session + community mod (if communityId) | **No global admin check for non-community threads.** `src/server/api/routers/forum.ts` line 594 |
| POST | `/api/trpc/forum.lockThread` | user | threadId | Session + community mod (if communityId) | **No global admin check for non-community threads.** `src/server/api/routers/forum.ts` line 629 |
| POST | `/api/trpc/forum.editThread` | user | threadId | Session + ownership check | Edit thread (owner only). `src/server/api/routers/forum.ts` line 665 |
| POST | `/api/trpc/forum.deleteThread` | user | threadId | Session + ownership/mod check | Delete thread. `src/server/api/routers/forum.ts` line 720 |
| POST | `/api/trpc/forum.editReply` | user | replyId | Session + ownership check | Edit reply. `src/server/api/routers/forum.ts` line 768 |
| POST | `/api/trpc/forum.deleteReply` | user | replyId | Session + ownership/mod check | Delete reply. `src/server/api/routers/forum.ts` line 821 |
| POST | `/api/trpc/forum.upsertRules` | user | None | Session + **admin-only check required** | Upsert forum rules. `src/server/api/routers/forum.ts` line 883 |
| POST | `/api/trpc/forum.updateIdeaStatus` | user | ideaId | Session + admin check | Update idea status. `src/server/api/routers/forum.ts` line 952 |
| POST | `/api/trpc/events.register` | user | eventId | Session | Register for event (payment flow). `src/server/api/routers/events.ts` line 55 |
| POST | `/api/trpc/events.cancelRegistration` | user | eventId | Session + ownership | Cancel event registration. `src/server/api/routers/events.ts` line 198 |
| GET | `/api/trpc/events.myRegistrations` | user | None | Session | List user's registrations. `src/server/api/routers/events.ts` line 275 |
| GET | `/api/trpc/events.registrationStatus` | user | eventId | Session | Get registration status. `src/server/api/routers/events.ts` line 294 |
| POST | `/api/trpc/events.createEvent` | user | None | Session | Create event (Luma integration). `src/server/api/routers/events.ts` line 467 |
| POST | `/api/trpc/communities.create` | user | None | Session | Create community. `src/server/api/routers/communities.ts` line 207 |
| POST | `/api/trpc/communities.join` | user | slug | Session | Join open community. `src/server/api/routers/communities.ts` line 265 |
| POST | `/api/trpc/communities.requestToJoin` | user | slug | Session | Request approval. `src/server/api/routers/communities.ts` line 327 |
| POST | `/api/trpc/communities.acceptInvite` | user | code | Session | Accept invite code. `src/server/api/routers/communities.ts` line 394 |
| POST | `/api/trpc/communities.leave` | user | slug | Session | Leave community. `src/server/api/routers/communities.ts` line 479 |
| GET | `/api/trpc/communities.getMyCommunities` | user | None | Session | List user's communities. `src/server/api/routers/communities.ts` line 542 |
| POST | `/api/trpc/communities.updateSettings` | user | slug | Session + owner/admin check | Update community settings. `src/server/api/routers/communities.ts` line 560 |
| POST | `/api/trpc/communities.setMemberRole` | user | slug, targetUserId | Session + `canManageRole()` hierarchy check | Change member role. `src/server/api/routers/communities.ts` line 690 |
| POST | `/api/trpc/communities.banMember` | user | slug, targetUserId | Session + role check | Ban member. `src/server/api/routers/communities.ts` line 796 |
| POST | `/api/trpc/communities.removeMember` | user | slug, targetUserId | Session + role check | Remove member. `src/server/api/routers/communities.ts` line 836 |
| POST | `/api/trpc/challenges.enroll` | user | id | Session | Enroll in challenge. `src/server/api/routers/challenges.ts` line 127 |
| POST | `/api/trpc/challenges.abandon` | user | id | Session + enrollment ownership | Abandon challenge. `src/server/api/routers/challenges.ts` line 299 |
| GET | `/api/trpc/challenges.getMyEnrollments` | user | None | Session | List user's enrollments. `src/server/api/routers/challenges.ts` line 355 |
| GET | `/api/trpc/challenges.getProgress` | user | challengeId | Session + enrollment ownership | Get challenge progress. `src/server/api/routers/challenges.ts` line 369 |
| POST | `/api/trpc/challenges.propose` | user | None | Session | Propose new challenge (draft). `src/server/api/routers/challenges.ts` line 632 |
| POST | `/api/trpc/challenges.create` | user | None | Session (**no admin/sponsor role check**) | Create challenge. `src/server/api/routers/challenges.ts` line 713 |
| POST | `/api/trpc/challenges.submitSolution` | user | challengeId | Session + enrollment check | Submit challenge solution. `src/server/api/routers/challenges.ts` line 834 |
| POST | `/api/trpc/challenges.reviewSolution` | user | challengeId, enrollmentId | Session + **creator check only** | Review/approve solution. `src/server/api/routers/challenges.ts` line 936 |
| POST | `/api/trpc/articles.create` | user | None | Session | Create article draft. `src/server/api/routers/articles.ts` line 61 |
| POST | `/api/trpc/articles.submit` | user | slug | Session + ownership | Submit article for review/publish. `src/server/api/routers/articles.ts` line 185 |
| POST | `/api/trpc/articles.delete` | user | slug | Session + ownership | Delete article. `src/server/api/routers/articles.ts` line 283 |
| GET | `/api/trpc/inbox.listConversations` | user | None | Session (filtered to own userId) | List conversations. `src/server/api/routers/inbox.ts` line 34 |
| GET | `/api/trpc/inbox.getMessages` | user | conversationId | Session + participant check | Get messages in conversation. `src/server/api/routers/inbox.ts` line 204 |
| POST | `/api/trpc/inbox.sendMessage` | user | conversationId | Session + participant check | Send message. `src/server/api/routers/inbox.ts` line 277 |
| POST | `/api/trpc/inbox.startConversation` | user | participantIds[] | Session | Start new conversation. `src/server/api/routers/inbox.ts` line 364 |
| GET | `/api/trpc/notifications.list` | user | None | Session (filtered to own userId) | List notifications. `src/server/api/routers/notifications.ts` line 10 |
| POST | `/api/trpc/notifications.markRead` | user | notificationId | Session + ownership | Mark notification read. `src/server/api/routers/notifications.ts` line 54 |
| POST | `/api/trpc/notifications.delete` | user | notificationId | Session + ownership | Delete notification. `src/server/api/routers/notifications.ts` line 82 |
| POST | `/api/trpc/launchpad.create` | user | None | Session | Create launchpad project. `src/server/api/routers/launchpad.ts` line 249 |
| POST | `/api/trpc/launchpad.update` | user | slug | Session + creator check | Update project. `src/server/api/routers/launchpad.ts` line 333 |
| POST | `/api/trpc/launchpad.vote` | user | slug | Session | Vote on project. `src/server/api/routers/launchpad.ts` line 466 |
| POST | `/api/trpc/launchpad.addComment` | user | slug | Session | Comment on project. `src/server/api/routers/launchpad.ts` line 546 |
| POST | `/api/trpc/benchmark.submitQuestion` | user | None | Session | Submit benchmark question. `src/server/api/routers/benchmark.ts` line 81 |
| POST | `/api/trpc/benchmark.voteQuestion` | user | questionId | Session | Vote on benchmark question. `src/server/api/routers/benchmark.ts` line 108 |
| POST | `/api/trpc/sponsors.submitApplication` | user | None | Session | Submit sponsorship application. `src/server/api/routers/sponsors.ts` line 38 |
| GET | `/api/trpc/activity.getFeed` | user | None | Session | Get activity feed. `src/server/api/routers/activity.ts` line 13 |
| GET | `/api/trpc/onboarding.getStatus` | user | None | Session | Get onboarding status. `src/server/api/routers/onboarding.ts` line 99 |

### 4.4 tRPC Procedures — Agent API (Bearer API Key)

| Method | Endpoint Path | Required Role | Object ID Parameters | Authorization Mechanism | Description & Code Pointer |
|---|---|---|---|---|---|
| GET | `/api/trpc/agent.browseThreads` | agent (read) | communitySlug? | API key + scope:read | Browse forum threads. `src/server/api/routers/agent.ts` line 81 |
| GET | `/api/trpc/agent.browseMembers` | agent (read) | communitySlug? | API key + scope:read | Browse members with **unescaped LIKE search**. `src/server/api/routers/agent.ts` line 266 |
| GET | `/api/trpc/agent.searchKnowledge` | agent (read) | communitySlug? | API key + scope:read | Search knowledge base. `src/server/api/routers/agent.ts` line 341 |
| GET | `/api/trpc/agent.myProfile` | agent (read) | None | API key + scope:read | Get agent + owner profile. `src/server/api/routers/agent.ts` line 483 |
| GET | `/api/trpc/agent.getBriefing` | agent (read) | None | API key + scope:read | Platform briefing summary. `src/server/api/routers/agent.ts` line 685 |
| POST | `/api/trpc/agent.replyToThread` | agent (contribute) | threadId | API key + scope:contribute | Reply to thread (creates draft). `src/server/api/routers/agent.ts` line 905 |
| POST | `/api/trpc/agent.suggestTopic` | agent (contribute) | None | API key + scope:contribute | Suggest new topic. `src/server/api/routers/agent.ts` line 1236 |
| POST | `/api/trpc/agent.enrollInChallenge` | agent (contribute) | challengeId | API key + scope:contribute + requireOwner | Enroll owner in challenge. `src/server/api/routers/agent.ts` line 1571 |
| POST | `/api/trpc/agent.reportObjectiveProgress` | agent (contribute) | challengeId | API key + scope:contribute + requireOwner | Self-report objective. `src/server/api/routers/agent.ts` line 1682 |
| POST | `/api/trpc/agent.reportTestResults` | agent (contribute) | challengeId | API key + scope:contribute + requireOwner | Report test results. `src/server/api/routers/agent.ts` line 1760 |
| POST | `/api/trpc/agent.submitSolution` | agent (contribute) | challengeId | API key + scope:contribute + requireOwner | Submit solution. `src/server/api/routers/agent.ts` line 2041 |
| GET | `/api/trpc/inbox.agentCheckInbox` | agent | None | API key (any scope) | Get agent unread messages. `src/server/api/routers/inbox.ts` line 499 |
| POST | `/api/trpc/inbox.agentSendMessage` | agent | None | API key (any scope) + requireOwner | Send message to owner. `src/server/api/routers/inbox.ts` line 548 |
| GET | `/api/trpc/inbox.agentGetOwnerDMs` | agent | None | API key + canReadOwnerDMs flag | **Reads ALL owner DM conversations.** `src/server/api/routers/inbox.ts` line 690 |

---

## 5. Potential Input Vectors for Vulnerability Analysis

**Network Surface Focus:** Only vectors reachable through the deployed web application's network interface.

### 5.1 URL Parameters
- `GET /api/trpc/members.listMembers?input={search:"..."}` — `search` field interpolated directly into ILIKE without escaping (`src/server/api/routers/members.ts` lines 188-189)
- `GET /api/trpc/agent.browseMembers?input={search:"..."}` — same ILIKE injection (`src/server/api/routers/agent.ts` line 319)
- `GET /api/trpc/forum.getThreads?input={category:"...",search:"..."}` — `search` used in ILIKE with proper escaping
- `GET /api/trpc/sponsors.jobs?input={search:"..."}` — search field
- `GET /api/trpc/communities.list?input={search:"..."}` — search with `escapeLike()` applied
- `GET /en/[locale]/auth/signin?redirect=...` — `redirect` query param built from `pathname` (server-constructed, low risk)
- `GET /api/[...slug]` — PayloadCMS REST `depth=`, `page=`, `limit=`, `where[field][operator]=value` query parameters
- `GET /en/og/route.tsx?title=...&subtitle=...` — title/subtitle rendered in SVG ImageResponse via React JSX (auto-escaped)

### 5.2 POST Body Fields (JSON/tRPC Input)
- **Authentication:**
  - `/api/auth/sign-in/email`: `{email, password}` — `src/app/api/auth/[...all]/route.ts`
  - `/api/auth/sign-up/email`: `{email, password, name}` — `src/app/api/auth/[...all]/route.ts`
  - `/api/auth/forgot-password`: `{email}` — `src/app/api/auth/[...all]/route.ts`
  - `/api/auth/reset-password`: `{token, newPassword}` — `src/app/api/auth/[...all]/route.ts`

- **Forum Content (Lexical rich-text — stored XSS vector):**
  - `forum.createThread`: `{title, content: LexicalJSON, category, tags?}` — content rendered by LexicalRenderer with `javascript:` href support (`src/server/api/routers/forum.ts` line 435)
  - `forum.addReply`: `{threadId, content: LexicalJSON}` — same render path (`src/server/api/routers/forum.ts` line 498)
  - `forum.editThread`: `{threadId, title?, content?: LexicalJSON, ...}` — (`src/server/api/routers/forum.ts` line 665)
  - `forum.editReply`: `{replyId, content: LexicalJSON}` — (`src/server/api/routers/forum.ts` line 768)
  - `challengeChannel.createThread`: `{channelId, type, title, content: LexicalJSON}` — (`src/server/api/routers/challenge-channel.ts` line 152)

- **Articles (Lexical rich-text — stored XSS vector):**
  - `articles.create`: `{title, slug, content: LexicalJSON, type, tags?, mediaUrl?}` — (`src/server/api/routers/articles.ts` line 61)
  - `articles.update`: `{slug, ...updates}` including `content: LexicalJSON` — (`src/server/api/routers/articles.ts` line 106)

- **Webhook URL (SSRF vector):**
  - `agentManagement.upsertWebhook`: `{url, categories[]}` — `url` validated by `validateWebhookUrl()` (bypassable via DNS rebinding, IPv4-mapped IPv6, hex-encoded IPs) (`src/server/api/routers/agent-management.ts` line 465)
  - `/api/agent/webhook` PUT body: `{url, categories, secret?}` — same SSRF protection (`src/app/api/agent/webhook/route.ts` line 67)

- **Agent Profile (free-text fields — potential stored XSS):**
  - `agentManagement.createAgent`: `{name, avatar?, bio?, visibilityMode}` — (`src/server/api/routers/agent-management.ts` line 42)
  - `agent.updateOwnProfile`: `{bio?, expertiseTags?, description?}` — (`src/server/api/routers/agent.ts` line 1365)

- **Member Profile (free-text fields):**
  - `members.upsertProfile`: `{displayName, bio, location?, image?, interests?, expertiseTags?}` — (`src/server/api/routers/members.ts` line 56)

- **Feed Posts (stored content):**
  - `feed.createPost`: `{communityId, content, imageUrl?}` — (`src/server/api/routers/feed.ts` line 144)
  - `agent.createFeedPost` via agentFeedRouter — same

- **Mollie Webhook (no auth):**
  - `/api/mollie/webhook` POST: FormData with `id` (paymentId) — passed to Mollie SDK for status fetch (`src/app/api/mollie/webhook/route.ts`)

- **File Upload:**
  - `/api/upload` POST: FormData with `file` (image), `alt` — `file.type` is client-supplied without magic byte verification (`src/app/api/upload/route.ts`)

- **Twitter Verification (SSRF low-risk):**
  - `agentManagement.submitVerification`: `{tweetUrl}` — URL validated by regex, base URL hardcoded to `publish.twitter.com` (`src/server/api/routers/agent-management.ts` line 1027)

### 5.3 HTTP Headers
- `Authorization: Bearer <api_key>` — Agent API key for `agentProcedure` and `/api/agent/webhook`. SHA-256 hash compared against DB. `src/server/api/trpc.ts` line 147
- `Cookie: better-auth.session_token=<token>` — Session token. Value checked for existence in middleware, validated in tRPC context. `src/middleware.ts` lines 29-31
- `Cookie: __Secure-better-auth.session_token=<token>` — Production session cookie variant
- `Authorization: Bearer <CRON_SECRET>` — Cron job authentication. Single shared secret for all 7 cron endpoints. `src/app/api/cron/*/route.ts`
- `Content-Type: multipart/form-data` — Upload endpoint only

### 5.4 Cookie Values
- `better-auth.session_token` — Session token value. Any manipulation attempted here would fail Better Auth validation unless the signing secret is compromised.
- `__Secure-better-auth.session_token` — Production variant with Secure prefix

### 5.5 PayloadCMS REST API Inputs
- `GET /api/articles?where[authorId][equals]={userId}` — Author filter
- `GET /api/comments?where[articleId][equals]={id}` — Comment filter (public read collection)
- `POST /api/articles` — Create article (admin auth required)
- `GET /api/media/{id}` — Fetch uploaded media (public read, S3-backed)
- All PayloadCMS REST endpoints accept `depth=`, `limit=`, `page=`, `sort=`, `where[field][operator]=value` query parameters

---

## 6. Network & Interaction Map

### 6.1 Entities

| Title | Type | Zone | Tech | Data | Notes |
|---|---|---|---|---|---|
| UserBrowser | Identity | Internet | Browser | Public | End-user browser — human or AI agent operator |
| AIAgent | Identity | Internet | API client (MCP/REST) | Tokens | Automated agent using API key |
| CloudflareEdge | ExternAsset | Edge | Cloudflare CDN | Public | CDN/edge layer in front of Vercel |
| VercelApp | Service | App | Next.js 15 / Node.js | PII, Tokens | Main application server (serverless functions on Vercel) |
| tRPCGateway | Service | App | tRPC v11 | PII, Tokens | API gateway for 260+ procedures at `/api/trpc` |
| BetterAuth | Service | App | Better Auth v1.4.5 | Tokens, PII | Authentication/session management at `/api/auth/*` |
| PayloadCMS | Service | App | PayloadCMS 3.x | PII, Public | Content management system admin panel at `/admin` |
| MCPServer | Service | App | MCP / Streamable HTTP | Tokens | AI agent tool server at `/api/mcp` — dual auth |
| NeonPostgres | DataStore | Data | PostgreSQL / Neon serverless | PII, Tokens, Secrets | Primary database — dual schema (app + public) |
| AWSS3 | DataStore | ThirdParty | Amazon S3 | Public | Media file storage — `disablePayloadAccessControl: true` |
| MollieAPI | ThirdParty | ThirdParty | Mollie v4 | Payments | Payment processing — no webhook signature verification |
| ResendEmail | ThirdParty | ThirdParty | Resend v6.9.2 | PII | Email delivery via `noreply@mailer.aitcommunity.org` |
| LumaCalendar | ThirdParty | ThirdParty | Luma API | Public | Calendar/events integration — AES-256-GCM encrypted API key |
| GitHubOAuth | ThirdParty | ThirdParty | GitHub OAuth | Tokens | OAuth identity provider |
| VercelCron | Service | App | Vercel Cron | Public | Cron trigger for 7 scheduled jobs — shared CRON_SECRET |
| AdminUser | Identity | Admin | Browser | Secrets | PayloadCMS admin users with admin/editor roles |

### 6.2 Entity Metadata

| Title | Metadata Key: Value; Key: Value |
|---|---|
| VercelApp | Hosts: `https://www.aitcommunity.org`; Regions: Vercel Edge (global); Auth: Better Auth session cookies + Agent API keys + CRON_SECRET + Payload session; Locales: `en`, `nl`; Headers: HSTS max-age=63072000, X-Frame-Options:DENY, X-Content-Type-Options:nosniff, COEP:same-origin, CORP:same-origin; Missing: Content-Security-Policy for HTML |
| tRPCGateway | Endpoint: `/api/trpc/[trpc]`; Methods: GET, POST; Procedures: 260+; Routers: post, events, members, forum, sponsors, articles, agentManagement, agent, activity, inbox, impact, notifications, onboarding, challengeChannel, challengeEngine, challenges, benchmark, launchpad, comments, communities, feed, luma |
| BetterAuth | Version: 1.4.5; Endpoint: `/api/auth/[...all]`; Providers: email/password (bcrypt, requireEmailVerification), GitHub OAuth; Session storage: PostgreSQL; Cookie names: `better-auth.session_token`, `__Secure-better-auth.session_token`; Trusted origins: env-var driven + dev mode host header trust |
| PayloadCMS | Admin panel: `/admin`; REST API: `/api/[collection-slug]`; Collections: 20; Auth: email/password, max 5 attempts, 15min lockout; Secret: `PAYLOAD_SECRET` or fallback to `"dev-secret-change-me"`; Roles: admin, editor |
| MCPServer | Endpoint: `/api/mcp`; Protocol: Streamable HTTP; Tools: ~50 authenticated + 2 unauthenticated; Unauthenticated tools: register-agent, get-agent-guide; Rate limit: 3 registrations/hr/IP (in-memory) |
| NeonPostgres | Engine: PostgreSQL serverless (Neon); SSL: verify-full enforced; Schemas: `app` (Drizzle), `public` (PayloadCMS); No RLS policies; Consumers: VercelApp only |
| AWSS3 | Exposure: Public read for all media; Access Control: disabled at PayloadCMS plugin level; MIME: image/* only at upload time |
| MollieAPI | Webhook path: `/api/mollie/webhook`; Signature verification: **NONE**; Payment status: fetched from Mollie API using payment ID from FormData |
| VercelCron | Auth: Single `CRON_SECRET` Bearer token for all 7 endpoints; Rate: In-memory per-function (ineffective serverless) |

### 6.3 Flows (Connections)

| FROM → TO | Channel | Path/Port | Guards | Touches |
|---|---|---|---|---|
| UserBrowser → CloudflareEdge | HTTPS | `:443` | tls | Public |
| CloudflareEdge → VercelApp | HTTPS | `:443` | tls, Cloudflare proxy | Public |
| UserBrowser → VercelApp | HTTPS | `:443 /api/auth/sign-in/email` | None | PII, Tokens |
| UserBrowser → VercelApp | HTTPS | `:443 /api/auth/sign-up/email` | rate-limit:registration | PII |
| UserBrowser → VercelApp | HTTPS | `:443 /api/auth/callback/github` | None | Tokens |
| UserBrowser → VercelApp | HTTPS | `:443 /api/trpc/*` (public) | None | Public |
| UserBrowser → VercelApp | HTTPS | `:443 /api/trpc/*` (protected) | auth:user | PII |
| UserBrowser → VercelApp | HTTPS | `:443 /api/upload` | auth:user | PII |
| UserBrowser → VercelApp | HTTPS | `:443 /api/trpc/communities.*` | auth:user, auth:community-role | PII |
| UserBrowser → VercelApp | HTTPS | `:443 /admin` | auth:payload-admin | Secrets |
| AIAgent → VercelApp | HTTPS | `:443 /api/mcp` | None (registration) | Tokens |
| AIAgent → VercelApp | HTTPS | `:443 /api/mcp` | auth:agent-apikey, rate-limit:60/min | PII |
| AIAgent → VercelApp | HTTPS | `:443 /api/trpc/agent.*` | auth:agent-apikey, scope:read/contribute | PII |
| AIAgent → VercelApp | HTTPS | `:443 /api/agent/webhook` | auth:agent-apikey | Secrets |
| MollieAPI → VercelApp | HTTPS | `:443 /api/mollie/webhook` | **None** | Payments |
| VercelCron → VercelApp | HTTPS | `:443 /api/cron/*` | auth:cron-secret | PII |
| VercelApp → NeonPostgres | TCP | `:5432` (TLS) | ssl:verify-full, neon-proxy | PII, Tokens, Secrets |
| VercelApp → AWSS3 | HTTPS | `:443` | aws-credentials | Public |
| VercelApp → MollieAPI | HTTPS | `:443` | api-key-auth | Payments |
| VercelApp → ResendEmail | HTTPS | `:443` | api-key-auth | PII |
| VercelApp → LumaCalendar | HTTPS | `:443` | api-key-auth (AES-encrypted key) | Public |
| VercelApp → GitHubOAuth | HTTPS | `:443` | oauth-client-credentials | Tokens |
| VercelApp → AgentWebhooks | HTTPS | user-registered URL | ssrf-check (bypassable) | Tokens |
| VercelApp → TwitterOEmbed | HTTPS | `:443 publish.twitter.com` | url-validation | Public |

### 6.4 Guards Directory

| Guard Name | Category | Statement |
|---|---|---|
| auth:user | Auth | Requires a valid Better Auth session cookie (`better-auth.session_token`). Session validated against PostgreSQL on every request. `src/server/api/trpc.ts` lines 126-138 |
| auth:agent-apikey | Auth | Requires `Authorization: Bearer <api_key>` header. API key SHA-256 hash compared against `agentApiKeys.keyHash`. Agent status must be "active" or "unclaimed". `src/server/agent/api-key.ts` |
| auth:payload-admin | Auth | Requires valid PayloadCMS session (separate from Better Auth). Separate login at `/admin/login`. Max 5 attempts, 15-min lockout. `src/payload.config.ts` |
| auth:cron-secret | Auth | Requires `Authorization: Bearer <CRON_SECRET>`. Single shared secret for all 7 cron endpoints. `src/app/api/cron/*/route.ts` |
| scope:read | Authorization | Agent API key must include "read" in its scopes array. Called via `requireScope(ctx.agent.scopes, "read")` inline in each procedure. `src/server/api/trpc.ts` lines 185-192 |
| scope:contribute | Authorization | Agent API key must include "contribute" in its scopes array. Called inline per procedure. |
| scope:self-profile | Authorization | Agent API key must include "self-profile" in its scopes array. |
| auth:community-role | Authorization | User must be a member with "active" status in the target community (resolved via `communityProcedure` middleware). `ctx.communityRole` will be null for non-active members. `src/server/api/trpc.ts` lines 215-257 |
| role:community-moderator | Authorization | `ctx.communityRole` must be "moderator", "admin", or "owner" (hierarchy value ≥ 2). Used by pinThread, lockThread. |
| role:community-admin | Authorization | `ctx.communityRole` must be "admin" or "owner" (hierarchy value ≥ 3). Used by updateSettings, generateInviteLink. |
| role:community-owner | Authorization | `ctx.communityRole` must be "owner" (hierarchy value = 4). Used by transferOwnership. |
| ownership:agent | ObjectOwnership | Verifies `agentProfiles.ownerId === ctx.session.user.id` before agent management operations. |
| ownership:content | ObjectOwnership | Verifies `thread.authorId === userId` or `reply.authorId === userId` before edit/delete. |
| ownership:enrollment | ObjectOwnership | Verifies challenge enrollment belongs to requesting user before progress/submission operations. |
| ownership:conversation | ObjectOwnership | Verifies user is a participant (`conversationParticipants`) before accessing messages. `src/server/api/routers/inbox.ts` lines 216-225 |
| canManageRole | Authorization | Enforces role hierarchy: actor's role level must be strictly greater than target role level. `src/server/communities/role-utils.ts` line 18 |
| requireOwner:agent | Authorization | Agent must have a non-null `ownerId` (be a claimed agent). `src/server/api/trpc.ts` lines 199-207 |
| ssrf-check | Network | `validateWebhookUrl()` blocks: localhost, RFC1918 IPs, cloud metadata endpoints, IPv6 private ranges. String-based — **bypassable via DNS rebinding and alternative IP encodings.** `src/server/agent/validate-webhook-url.ts` |
| rate-limit:60/min | RateLimit | In-memory rate limit: 60 req/min per agentId. **Ineffective across Vercel serverless instances.** `src/server/agent/rate-limit.ts` |
| rate-limit:registration | RateLimit | In-memory: 3 registrations/hr per IP. Same ineffectiveness caveat. |
| canReadOwnerDMs | Authorization | `agentProfiles.canReadOwnerDMs` boolean flag must be true. Controls `agentGetOwnerDMs` access. Default: true. `src/server/api/routers/inbox.ts` line 700 |

---

## 7. Role & Privilege Architecture

### 7.1 Discovered Roles

| Role Name | Privilege Level | Scope/Domain | Code Implementation |
|---|---|---|---|
| anon | 0 | Global | No authentication required. `publicProcedure` in `src/server/api/trpc.ts` line 116 |
| user | 1 | Global | Authenticated Better Auth session. `protectedProcedure` in `src/server/api/trpc.ts` lines 126-138 |
| community:member | 2 | Community | Active membership (status="active", role="member"). `communityProcedure` in `src/server/api/trpc.ts` |
| community:moderator | 3 | Community | role="moderator" in communityMemberships. `src/server/communities/role-utils.ts` hierarchy value 2 |
| community:admin | 4 | Community | role="admin" in communityMemberships. Hierarchy value 3 |
| community:owner | 5 | Community | role="owner" in communityMemberships. Hierarchy value 4. Auto-assigned on community creation. |
| agent:unclaimed | 1 | Global | Agent API key, no ownerId. Default scopes: ["read", "contribute", "self-profile"]. Write rate-limited (5 posts/hr, 10 comments/hr). |
| agent:claimed | 2 | Global | Agent API key with ownerId set. Can access owner's DMs (if canReadOwnerDMs=true). |
| payload:editor | 3 | Admin | PayloadCMS editor role. Access to admin panel content editing. |
| payload:admin | 4 | Admin | PayloadCMS admin role. Full admin panel access. |

### 7.2 Privilege Lattice

```
Global Privilege Ordering (→ means "can access resources of"):
anon → user → community:member → community:moderator → community:admin → community:owner

PayloadCMS (separate auth domain):
payload:editor → payload:admin

Agent API Key Domain (parallel to session-based user):
agent:unclaimed (API key, no owner) → agent:claimed (API key, with owner)

Parallel Isolation (|| means "not ordered relative to each other"):
user || agent:unclaimed (different auth domains, cannot escalate between them)
community:owner(A) || community:owner(B) (isolated across different communities)
payload:admin || community:owner (completely separate auth systems)
```

**Role Switching:** No impersonation or sudo mode found. Agent claim (`claimAgent`) upgrades unclaimed → claimed status and binds agent to a user account.

**CRITICAL NOTE:** The `claimAgent` procedure accepts `{token}` OR `{agentId}`. The agentId path does NOT check token expiration — any authenticated user can claim any unclaimed agent by ID, bypassing token validation entirely.

### 7.3 Role Entry Points

| Role | Default Landing Page | Accessible Route Patterns | Authentication Method |
|---|---|---|---|
| anon | `/en` | `/en`, `/en/auth/*`, `/en/communities`, `/en/events`, `/en/challenges`, `/en/members`, `/en/forum`, `/en/impact`, `/en/benchmark`, `/en/blog`, `/en/launchpad`, `/en/jobs`, `/en/sponsors` | None |
| user | `/en/dashboard` | All anon routes + `/en/dashboard/*`, `/en/profile`, `/en/inbox`, `/en/notifications`, `/en/agent/*` | Session cookie (Better Auth) |
| community:member | `/en/communities/[slug]` | Community-specific routes + dashboard | Session cookie + community membership |
| community:moderator | `/en/communities/[slug]` | + moderation tools (pin/lock threads) | Session cookie + moderator role |
| community:admin | `/en/communities/[slug]` | + member management, invite links | Session cookie + admin role |
| community:owner | `/en/communities/[slug]` | + settings, transfer ownership | Session cookie + owner role |
| agent:* | N/A (API only) | `/api/trpc/agent.*`, `/api/mcp` | Bearer API key |
| payload:editor | `/admin` | `/admin/*` content editing | PayloadCMS session |
| payload:admin | `/admin` | `/admin/*` full access | PayloadCMS session |

### 7.4 Role-to-Code Mapping

| Role | Middleware/Guards | Permission Checks | Storage Location |
|---|---|---|---|
| user | `protectedProcedure` | `if (!ctx.session?.user) throw UNAUTHORIZED` | Better Auth session (PostgreSQL `session` table) |
| community:moderator | `communityProcedure` | `if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin" && ctx.communityRole !== "moderator")` | `communityMemberships.role` (PostgreSQL) |
| community:admin | `communityProcedure` | `if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin")` | `communityMemberships.role` (PostgreSQL) |
| community:owner | `communityProcedure` | `if (ctx.communityRole !== "owner")` | `communityMemberships.role` (PostgreSQL) |
| agent | `agentProcedure` | `if (!authHeader?.startsWith("Bearer "))` + `requireScope()` per-procedure | `agentApiKeys.keyHash` (SHA-256, PostgreSQL) |
| payload:admin | PayloadCMS middleware | PayloadCMS internal auth | PayloadCMS `users` table (public schema) |

---

## 8. Authorization Vulnerability Candidates

### 8.1 Horizontal Privilege Escalation Candidates (IDOR)

| Priority | Endpoint Pattern | Object ID Parameter | Data Type | Sensitivity | Notes |
|---|---|---|---|---|---|
| High | `/api/trpc/agentManagement.reviewDraft` | draftId | agent content | Medium | Only checks `ownerId=userId`, no cross-owner isolation test needed but worth verifying |
| High | `/api/trpc/agentManagement.dismissSuggestion` | suggestionId | agent suggestion | Medium | Same ownerId-only check pattern |
| High | `/api/trpc/inbox.getMessages` | conversationId | private messages | High | Participant check exists but race condition possible; conversationId is UUID |
| High | `/api/trpc/notifications.markRead` / `delete` | notificationId | notifications | Medium | Verify ownership check on notificationId |
| High | `/api/trpc/challenges.getProgress` | challengeId | challenge progress | Medium | Enrollment filtered by userId but verify implementation |
| High | `/api/trpc/challenges.reviewSolution` | challengeId, enrollmentId | challenge solution | High | Only checks challenge.creatorId — any creator can review any enrollment |
| High | `/api/trpc/members.getPublicProfile` | userId | PII (profile) | Medium | May expose private profiles (isPublic=false?) |
| Medium | `/api/trpc/launchpad.deleteComment` | commentId | user comment | Low | Verify ownership check on commentId |
| Medium | `/api/trpc/launchpad.update` | slug | project data | Medium | Creator check — verify slug → creatorId isolation |
| Medium | `/api/trpc/forum.editThread` | threadId | forum content | Medium | Ownership check — verify threadId → authorId |
| Medium | `/api/trpc/forum.deleteReply` | replyId | forum reply | Medium | Verify ownership/mod check |
| Medium | `/api/trpc/events.cancelRegistration` | eventId | event registration | Medium | User's own registration filtered by userId — verify |
| Medium | `GET /api/[collection]/[id]` (PayloadCMS) | document id | varies | High | Default PayloadCMS access control — admin-only but verify |

### 8.2 Vertical Privilege Escalation Candidates

| Target Role | Endpoint Pattern | Functionality | Risk Level |
|---|---|---|---|
| community:moderator | `/api/trpc/forum.pinThread` | Pin any global forum thread (no admin check for non-community threads) | **Critical** |
| community:moderator | `/api/trpc/forum.lockThread` | Lock any global forum thread (no admin check for non-community threads) | **Critical** |
| payload:admin | `/admin` | PayloadCMS admin panel (bruteforce, default creds, secret fallback) | High |
| community:owner | `/api/trpc/agentManagement.claimAgent` with `{agentId}` | Claim any unclaimed agent without valid token (agentId path bypasses token) | **Critical** |
| community:owner | `/api/trpc/challenges.create` | Create official challenges without admin/sponsor role check | **Critical** |
| payload:admin | `/api/[...slug]` REST endpoints | Full PayloadCMS REST API if `PAYLOAD_SECRET="dev-secret-change-me"` | High |
| cron | `/api/cron/*` | Trigger maintenance ops if CRON_SECRET obtained | High |
| any | `/api/mollie/webhook` | Trigger arbitrary payment lookups (no auth) | Medium |

### 8.3 Context-Based Authorization Candidates

| Workflow | Endpoint | Expected Prior State | Bypass Potential |
|---|---|---|---|
| Forum posting | `/api/trpc/forum.createThread` | User has accepted forum rules (`acceptRules`) | Skip rule acceptance; verify if enforced or just UI |
| Forum posting | `/api/trpc/forum.submitIdea` | User has accepted forum rules | Same as above |
| Challenge completion | `/api/trpc/challenges.reviewSolution` | Valid enrollment exists, submission status = "submitted" | Direct review without valid submission state |
| Challenge objective self-report | `/api/trpc/agent.reportObjectiveProgress` | Challenge is active, enrollment is active | Report progress on already-completed/abandoned enrollment |
| Agent activation | `/api/trpc/agentManagement.claimAgent` | Valid claim token that hasn't expired | Use `{agentId}` input instead of `{token}` to bypass expiry |
| Payment flow | `events.register` → Mollie → `/api/mollie/webhook` | Payment initiated via Mollie | Directly POST to webhook with a known paymentId |
| Article publication | `/api/trpc/articles.submit` | Article is in draft status | Submit already-submitted/published article? |
| Community join | `/api/trpc/communities.join` | Community joinPolicy="open" | Join invite_only/approval_required community without invite code? |
| Email verification | `/api/auth/sign-up/email` + `/api/auth/verify-email` | User registered, verification email sent | If RESEND_API_KEY absent, verification email silently fails but user can't log in |

---

## 9. Injection Sources

### 9.1 SQL LIKE Injection Sources

**Source 1 — Members Search (Unauthenticated)**
- **File:** `src/server/api/routers/members.ts`, lines 188-189
- **Input:** `input.search` from `listMembers` publicProcedure — no auth required
- **Sink:** `ilike(memberProfiles.displayName, \`%${input.search}%\`)` and `ilike(memberProfiles.company, \`%${input.search}%\`)`
- **Data Flow:** HTTP GET `/api/trpc/members.listMembers?input={"search":"..."}` → tRPC input parsing → direct interpolation into ILIKE pattern
- **Sanitization:** None. Compare with `communities.ts` line 23-25 which uses `escapeLike()` helper
- **Attack:** `%`, `_` wildcards not escaped — allows unintended pattern matching

**Source 2 — Agent Browse Members (Agent API Key)**
- **File:** `src/server/api/routers/agent.ts`, line 319
- **Input:** `input.search` from `browseMembers` agentProcedure — API key required
- **Sink:** `ilike(memberProfiles.displayName, \`%${input.search}%\`)`
- **Data Flow:** MCP tool `browse-members` or API key + tRPC → direct ILIKE interpolation

### 9.2 Stored XSS / javascript: Href

**Source 3 — Lexical Rich-Text Link Renderer**
- **File:** `src/lib/lexical.tsx`, lines 260-274
- **Input:** User-authored link URLs in Lexical JSON content (articles, forum posts, forum replies, feed posts)
- **Sink:** `<a href={href}>` where `href = node.fields?.url ?? node.url ?? "#"` — no protocol validation
- **Data Flow:** User creates content with Lexical editor → submits via `forum.createThread` / `articles.create` / etc. → stored in PayloadCMS DB → rendered by `<LexicalRenderer>` components → `<a href="javascript:...">` in browser
- **Affected Components:**
  - `src/components/forum/thread-detail.tsx` line 298 (forum threads)
  - `src/components/forum/reply-list.tsx` line 149 (forum replies)
  - Article pages (all use LexicalRenderer)
  - Challenge channel threads
- **Sanitization:** None — images validate protocol (lines 284-287) but links do not

**Source 4 — JSON-LD Script Tag Injection**
- **File:** `src/components/json-ld.tsx`, lines 5-7
- **Input:** Article metadata (title, description, authorName) from database, passed as `data` prop
- **Sink:** `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({...data}) }}`
- **Data Flow:** DB record (e.g., `article.authorName`) → JsonLd component → script tag in HTML
- **Risk:** `JSON.stringify` doesn't escape `</script>` in string values → potential script tag breakout

### 9.3 SSRF Sources

**Source 5 — Agent Webhook URL (Registration + Dispatch)**
- **File:** `src/server/agent/webhook-dispatch.ts`, line 125 (dispatch); `src/server/api/routers/agent-management.ts` line 597 (test)
- **Input:** User-registered webhook URL (`agentManagement.upsertWebhook` or `/api/agent/webhook` PUT)
- **Sink:** `fetch(webhook.url, { method: "POST", headers, body, signal })`
- **Data Flow:** Authenticated user registers URL → stored in `agentWebhooks.url` → `testWebhook` triggers immediate fetch OR `dispatchWebhooks()` cron processes queued events → `fetch()` called
- **Bypass Vectors:**
  1. **DNS rebinding:** Domain resolves to public IP at validation time, flips to private IP at fetch time
  2. **IPv4-mapped IPv6:** `[::ffff:127.0.0.1]` not in validator's IPv6 blocklist (only checks `fc`, `fd`, `fe80` prefixes)
  3. **Alternative IP encodings:** Hex (`0x7f000001`), decimal (`2130706433`), octal (`017700000001`) bypass dotted-decimal regex checks
  4. **No DNS resolution check:** Validator never resolves hostname to IP at validation time
- **Code:** `src/server/agent/validate-webhook-url.ts` full file (validation logic with bypass vectors)

### 9.4 File Upload / Path Traversal

**Source 6 — Image Upload MIME Spoofing**
- **File:** `src/app/api/upload/route.ts`, lines 17-26
- **Input:** `file` in FormData — MIME type from `file.type` (client-supplied)
- **Sink:** PayloadCMS media collection storage (S3)
- **Data Flow:** POST `/api/upload` with crafted FormData → `file.type.startsWith("image/")` check (client-supplied) → PayloadCMS storage → S3
- **Risk:** Non-image file with spoofed `Content-Type: image/png` header could bypass type check; filename from `file.name` potentially unsanitized

### 9.5 Command Injection / Template Injection
- No `exec`, `spawn`, or shell command calls found in network-accessible code paths
- No server-side template engine (Handlebars, EJS, etc.) in network-accessible paths
- No `eval()` or `new Function()` in network-accessible server-side code

### 9.6 Deserialization
- No insecure deserialization identified in network-accessible code paths
- tRPC uses SuperJSON serializer (safe typed deserialization)
- PayloadCMS uses internal JSON parsing

### 3.2 Privilege Storage & Validation
- **Storage Location:** Community roles stored in `communityMemberships.role` (PostgreSQL). Agent scopes stored in `agentApiKeys.scopes` (JSON array). Session tokens in `session.token`. PayloadCMS roles in PayloadCMS `users` table.
- **Validation Points:**
  - Community role: `communityProcedure` middleware resolves membership at request time (src/server/api/trpc.ts lines 215-257)
  - Agent scopes: `requireScope()` called inline per procedure (not middleware-enforced — each procedure must call it explicitly)
  - Session: Better Auth reads session cookie on every request
- **Cache/Session Persistence:** No caching — roles/sessions validated from DB on every request. Session `expiresAt` enforced by Better Auth.
- **Code Pointers:** `src/server/api/trpc.ts` lines 116-257 (all four procedure tiers), `src/server/agent/api-key.ts` (API key validation)

### 3.3 Role Switching & Impersonation
- **Impersonation Features:** None found in the codebase. No admin impersonation of users.
- **Role Switching:** No temporary privilege elevation / "sudo mode" found.
- **Audit Trail:** `activityEvents` table logs user actions (`src/server/db/schema.ts`), but no dedicated audit trail for role changes.
- **Agent Claim Flow:** Unclaimed agents can be claimed by a human owner via `claimAgent` tRPC mutation, which upgrades the agent's scope level and creates an inbox conversation. **NOTE:** The `claimAgent` procedure accepts either a `token` OR an `agentId` — the agentId path bypasses token expiration validation (`src/server/api/routers/agent-management.ts` lines 883-994).
